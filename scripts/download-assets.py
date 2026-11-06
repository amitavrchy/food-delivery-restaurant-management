"""Download pinned Unsplash photos and a self-hosted Google font for local builds."""
from pathlib import Path
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor
import re
root = Path(__file__).resolve().parents[1] / 'frontend' / 'public'
photos = {'burger':'1568901346375-23c9450c58cd','chicken':'1606755962773-d324e0a13086','bowl':'1512621776951-a57141f2eefd','pasta':'1473093295043-cdd812d0e601','salad':'1540420773420-3366772f4999','fries':'1573080496219-bb080dd4f877','matcha':'1515823064-d6e0c04616a7','drink':'1544145945-f90425340c7e','brownie':'1606313564200-e75d5e30476c'}
def download(entry):
    name, photo = entry
    target = root / 'food' / (name+'.jpg')
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        with urlopen(f'https://images.unsplash.com/photo-{photo}?auto=format&fit=crop&w=1000&q=85') as response:
            target.write_bytes(response.read())
    print(name, target.stat().st_size)
with ThreadPoolExecutor(max_workers=5) as pool:
    list(pool.map(download, photos.items()))
fonts = root / 'fonts'
fonts.mkdir(parents=True, exist_ok=True)
request = Request('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',headers={'User-Agent':'Mozilla/5.0'})
css = urlopen(request).read().decode()
urls = list(dict.fromkeys(re.findall(r'url\((https[^)]+)\)',css)))
for index, url in enumerate(urls):
    suffix = '.woff2' if '.woff2' in url else '.ttf'
    filename = f'jakarta-{index}{suffix}'
    (fonts / filename).write_bytes(urlopen(url).read())
    css = css.replace(url, filename)
(fonts / 'fonts.css').write_text(css.replace("'Plus Jakarta Sans'", "'Jakarta'"),encoding='utf-8')
