"""Verify captured artifact integrity. This is NOT source/consensus authentication."""
import hashlib
import json
from pathlib import Path
base=Path(__file__).parent
manifest=json.loads((base/'historical/manifest.json').read_text())
for path,expected in manifest['sha256'].items():
    actual=hashlib.sha256((base/path).read_bytes()).hexdigest()
    if actual!=expected:raise SystemExit(f'Artifact changed: {path}')
print(f"Verified integrity of {len(manifest['sha256'])} cached artifacts; source authenticity remains unresolved.")
