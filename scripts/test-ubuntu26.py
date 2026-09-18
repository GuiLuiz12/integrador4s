#!/usr/bin/env python3
"""Run the current working tree in a disposable Ubuntu 26.04 KVM VM.

Never mounts the host filesystem/socket into the guest or copies its .env.
"""
import argparse
import functools
import hashlib
import http.server
import json
import os
import pathlib
import shutil
import socket
import subprocess
import tarfile
import tempfile
import threading
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
IMAGE_NAME = 'ubuntu-26.04-server-cloudimg-amd64.img'
IMAGE_URL = 'https://cloud-images.ubuntu.com/releases/26.04/release/'


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def message(value):
    print(f'[ubuntu26] {value}', flush=True)


def image_file(cache):
    cache.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(IMAGE_URL + 'SHA256SUMS', timeout=60) as response:
        sums = response.read().decode()
    expected = next(line.split()[0] for line in sums.splitlines()
                    if line.split()[-1].lstrip('*') == IMAGE_NAME)
    image = cache / IMAGE_NAME
    if not image.exists():
        message('Baixando imagem oficial Ubuntu 26.04 (aproximadamente 823 MiB).')
        partial = image.with_suffix('.partial')
        with urllib.request.urlopen(IMAGE_URL + IMAGE_NAME, timeout=60) as response, partial.open('wb') as output:
            shutil.copyfileobj(response, output)
        partial.rename(image)
    with image.open('rb') as source:
        actual = hashlib.file_digest(source, 'sha256').hexdigest()
    if actual != expected:
        raise RuntimeError(f'Checksum da imagem diverge. Remova somente {image} e repita.')
    return image, expected


def snapshot(destination):
    files = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
    with tarfile.open(destination, 'w:gz') as archive:
        for filename in sorted(set(filter(None, files))):
            path = pathlib.PurePosixPath(filename)
            if any(part in {'.git', '.agents', '.codex', 'node_modules', 'dist', '__pycache__'} for part in path.parts):
                continue
            if path.name.startswith('.env') and path.name != '.env.example':
                continue
            if path.parts[:2] == ('evidence', 'runs') or (ROOT / path).is_symlink():
                continue
            if (ROOT / path).is_file():
                archive.add(ROOT / path, arcname=filename, recursive=False)
    return hashlib.sha256(destination.read_bytes()).hexdigest()


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=pathlib.Path, default=pathlib.Path('/tmp/integrador4s-ubuntu26-test'))
    args = parser.parse_args()
    for tool in ['qemu-system-x86_64', 'qemu-img', 'ssh', 'ssh-keygen', 'scp', 'git']:
        if not shutil.which(tool):
            raise RuntimeError(f'Falta {tool}. No Ubuntu: sudo apt-get install qemu-system-x86 qemu-utils openssh-client git')
    if not os.access('/dev/kvm', os.R_OK | os.W_OK):
        raise RuntimeError('É necessário acesso de leitura/escrita a /dev/kvm para este teste.')
    memory = int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))
    if memory < 10 * 1024**2 or (os.cpu_count() or 0) < 6:
        raise RuntimeError('Reserve 10 GiB de memória disponível no host e ao menos 6 CPUs para testar sem comprometer o laboratório ativo.')
    if shutil.disk_usage('/tmp').free < 25 * 1024**3:
        raise RuntimeError('Reserve 25 GiB livres em /tmp para a VM e as imagens Docker.')
    image, image_sha = image_file(args.cache_dir.resolve())
    work = pathlib.Path(tempfile.mkdtemp(prefix='integrador4s-ubuntu26-vm-'))
    output = ROOT / 'evidence' / 'runs' / ('ubuntu26-install-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    output.mkdir(parents=True)
    os.chmod(output, 0o700)
    vm = server = None
    success = False
    try:
        run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'ubuntu26-install-test', '-f', str(work / 'key')])
        seed = work / 'seed'
        seed.mkdir()
        config = {'hostname': 'healthlab-ubuntu26', 'ssh_pwauth': False, 'disable_root': True,
                  'package_update': False, 'package_upgrade': False,
                  'users': [{'name': 'lab', 'shell': '/bin/bash', 'groups': ['sudo'],
                             'sudo': ['ALL=(ALL) NOPASSWD:ALL'], 'lock_passwd': True,
                             'ssh_authorized_keys': [(work / 'key.pub').read_text().strip()]}]}
        (seed / 'user-data').write_text('#cloud-config\n' + json.dumps(config))
        (seed / 'meta-data').write_text(json.dumps({'instance-id': work.name, 'local-hostname': 'healthlab-ubuntu26'}))
        (seed / 'vendor-data').write_text('#cloud-config\n{}\n')
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(seed)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        with socket.socket() as port_probe:
            port_probe.bind(('127.0.0.1', 0))
            ssh_port = port_probe.getsockname()[1]
        run(['qemu-img', 'create', '-f', 'qcow2', '-F', 'qcow2', '-b', str(image), str(work / 'disk.qcow2'), '40G'], stdout=subprocess.DEVNULL)
        message(f'Iniciando VM isolada: 6 vCPUs, 8 GiB RAM, disco 40 GiB. Evidências: {output.relative_to(ROOT)}')
        with (work / 'qemu.log').open('w') as log:
            vm = subprocess.Popen(['qemu-system-x86_64', '-enable-kvm', '-machine', 'q35', '-cpu', 'host',
                                   '-smp', '6', '-m', '8192', '-display', 'none', '-monitor', 'none',
                                   '-serial', f'file:{work / "serial.log"}',
                                   '-drive', f'file={work / "disk.qcow2"},if=virtio,format=qcow2',
                                   '-netdev', f'user,id=net0,hostfwd=tcp:127.0.0.1:{ssh_port}-:22',
                                   '-device', 'virtio-net-pci,netdev=net0',
                                   '-smbios', f'type=1,serial=ds=nocloud;s=http://10.0.2.2:{server.server_port}/'],
                                  stdout=log, stderr=log)
        options = ['-i', str(work / 'key'), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
                   '-o', 'StrictHostKeyChecking=accept-new', '-o', f'UserKnownHostsFile={work / "known_hosts"}',
                   '-o', 'ConnectTimeout=5']
        ssh = ['ssh', *options, '-p', str(ssh_port), 'lab@127.0.0.1']
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            if vm.poll() is not None:
                raise RuntimeError((work / 'qemu.log').read_text())
            if subprocess.run(ssh + ['true'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                break
            time.sleep(2)
        else:
            raise RuntimeError(f'VM não disponibilizou SSH em cinco minutos; consulte {work / "serial.log"}.')
        run(ssh + ['cloud-init status --wait'], timeout=180)
        archive = work / 'project.tar.gz'
        source_sha = snapshot(archive)
        with archive.open('rb') as source:
            run(ssh + ['mkdir -p project && tar xzf - -C project'], stdin=source)
        message('Executando bootstrap, setup, inicialização, integração e teste de persistência na VM.')
        with (output / 'installation.log').open('w') as log:
            run(ssh + ['cd project && bash scripts/test-install-guest.sh'], stdout=log, stderr=subprocess.STDOUT, timeout=1800)
        run(['scp', *options, '-P', str(ssh_port),
             'lab@127.0.0.1:project/evidence/runs/install-test/result.json', str(output / 'result.json')], stdout=subprocess.DEVNULL)
        result = json.loads((output / 'result.json').read_text())
        result.update({'image_url': IMAGE_URL + IMAGE_NAME, 'image_sha256': image_sha,
                       'source_archive_sha256': source_sha, 'vcpus': 6, 'memory_gib': 8, 'disk_gib': 40,
                       'hypervisor': 'QEMU/KVM', 'tested_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
        (output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        message('APROVADO: instalação completa, sete serviços, cobertura 100% e dados preservados após retomada.')
        success = True
        subprocess.run(ssh + ['sudo poweroff'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
    finally:
        if vm is not None:
            if vm.poll() is None:
                vm.terminate()
                try:
                    vm.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    vm.kill()
                    vm.wait()
            for name in ['serial.log', 'qemu.log']:
                if (work / name).exists():
                    shutil.copyfile(work / name, output / name)
        if server:
            server.shutdown()
            server.server_close()
        if success:
            shutil.rmtree(work)
            message('VM encerrada; disco e chave SSH temporários removidos. Laboratório do host preservado.')
        else:
            message(f'Teste incompleto. VM encerrada; arquivos privados de diagnóstico preservados em {work}.')


if __name__ == '__main__':
    main()
