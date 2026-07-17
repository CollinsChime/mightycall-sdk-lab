# Publish to GitHub Pages

The project is already configured for the public repository:

`https://github.com/CollinsChime/mightycall-sdk-lab`

## Upload from Visual Studio Code

Open this extracted folder in Visual Studio Code and run each command separately
from **Terminal → New Terminal**:

```powershell
git init
git branch -M main
git add .
git commit -m "Deploy MightyCall SDK Lab"
git remote add origin https://github.com/CollinsChime/mightycall-sdk-lab.git
git push -u origin main
```

GitHub may open a browser window for sign-in. Complete that authorization, then
return to Visual Studio Code and allow the push to finish.

## Enable GitHub Pages

After the files are uploaded:

1. Open `https://github.com/CollinsChime/mightycall-sdk-lab/settings/pages`.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open the repository's **Actions** tab and wait for **Deploy to GitHub Pages**
   to complete successfully.
4. Open `https://collinschime.github.io/mightycall-sdk-lab/`.

The deployment workflow runs again automatically whenever changes are pushed to
the `main` branch.
