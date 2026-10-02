"""Read-only installed-package advisory lookup; does not load application configuration."""
import importlib.metadata, json, urllib.request
from pathlib import Path
packages = sorted(({"name": d.metadata["Name"], "version": d.version} for d in importlib.metadata.distributions()), key=lambda p: p["name"].lower())
queries = [{"package": {"name": p["name"], "ecosystem": "PyPI"}, "version": p["version"]} for p in packages]
request = urllib.request.Request("https://api.osv.dev/v1/querybatch", data=json.dumps({"queries": queries}).encode(), headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        results = json.load(response)["results"]
    evidence = [{**p, **r} for p, r in zip(packages, results)]
    output = {"source": "OSV querybatch", "packages": evidence, "paginationComplete": not any(r.get("next_page_token") for r in results)}
    affected = [p for p in evidence if p.get("vulns")]
    print(json.dumps({"checked": len(packages), "affectedPackages": affected, "paginationComplete": output["paginationComplete"]}, indent=2))
except Exception as error:
    output = {"source": "OSV querybatch", "status": "Not verified", "errorType": type(error).__name__, "packages": packages}
    print(json.dumps({"status": "Not verified", "errorType": type(error).__name__, "checked": 0}))
Path(__file__).with_name("python-dependency-audit.json").write_text(json.dumps(output, indent=2), encoding="utf-8")
