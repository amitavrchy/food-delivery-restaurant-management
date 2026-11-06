"""One-time migration from a root workspace to two independent applications."""
from pathlib import Path
import json, shutil

root = Path(__file__).resolve().parents[2]
def move(source, destination):
    src=(root/source).resolve(); dst=(root/destination).resolve()
    if not src.is_relative_to(root) or not dst.is_relative_to(root):
        raise RuntimeError('Move outside project refused')
    if src.exists():
        if dst.exists(): raise RuntimeError(f'Destination already exists: {dst}')
        dst.parent.mkdir(parents=True,exist_ok=True)
        shutil.move(str(src),str(dst))

moves={
    'docs':'backend/docs', 'scripts/download-assets.py':'frontend/tools/download-assets.py',
    'scripts/setup.mjs':'backend/tools/setup.mjs', 'tests':'frontend/tests',
    'playwright.config.ts':'frontend/playwright.config.ts', 'compose.yaml':'backend/compose.yaml',
    'README.md':'backend/README.md','Project_spec.md':'backend/docs/Project_spec.md',
    '.github':'backend/ci/github', 'artifacts':'frontend/artifacts',
    'test-results':'frontend/test-results','playwright-report':'frontend/playwright-report',
    'node_modules':'backend/.cache/workspace-node_modules',
    'package.json':'backend/tools/previous-workspace/package.json',
    'package-lock.json':'backend/tools/previous-workspace/package-lock.json',
    '.gitignore':'backend/tools/previous-workspace/gitignore',
    '.editorconfig':'backend/.editorconfig','.gitattributes':'backend/.gitattributes',
    '.prettierrc.json':'backend/.prettierrc.json','.prettierignore':'backend/.prettierignore',
}
for source,destination in moves.items():move(source,destination)
for name in ['.editorconfig','.gitattributes','.prettierrc.json']:
    shutil.copyfile(root/'backend'/name,root/'frontend'/name)
if (root/'scripts').exists(): (root/'scripts').rmdir()
for app in ['backend','frontend']:
    (root/app/'.gitignore').write_text('node_modules/\n.cache/\n.next/\ndist/\n.env\n.env.local\n.env.*.local\n*.log\n*.tsbuildinfo\nartifacts/\ntest-results/\nplaywright-report/\ncoverage/\n',encoding='utf-8')
    (root/app/'.prettierignore').write_text('node_modules\n.cache\n.next\ndist\npackage-lock.json\npublic\nprisma/migrations\nartifacts\ntest-results\nplaywright-report\ntools/previous-workspace\n',encoding='utf-8')
backend=root/'backend/package.json';data=json.loads(backend.read_text(encoding='utf-8'))
data['devDependencies'].update({'typescript':'^5.9.3','prisma':'6.19.3','prettier':'^3.8.0'})
data['dependencies']['socket.io-client']='^4.8.1'
data['overrides']={'deepmerge-ts':'8.0.2'}
data['scripts'].update({'setup':'node tools/setup.mjs','dev:all':'node tools/dev.mjs','verify':'node tools/verify.mjs','format':'prettier --write src test prisma/*.ts tools/*.mjs','format:check':'prettier --check src test prisma/*.ts tools/*.mjs','infra':'docker compose up -d postgres redis'})
backend.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
frontend=root/'frontend/package.json';data=json.loads(frontend.read_text(encoding='utf-8'))
data['devDependencies'].update({'typescript':'^5.9.3','@playwright/test':'^1.65.0','prettier':'^3.8.0'})
data['scripts'].update({'test:e2e':'playwright test','format':'prettier --write src tests *.ts','format:check':'prettier --check src tests *.ts'})
frontend.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
compose=root/'backend/compose.yaml';compose.write_text('name: food-delivery-restaurant-management\n'+compose.read_text(encoding='utf-8'),encoding='utf-8')
print('Two-folder migration finished. Archived original workspace manifests under backend/tools/previous-workspace.')
