
try{const v=localStorage.getItem('luks-theme')||'system';document.documentElement.dataset.theme=v==='light'||v==='dark'?v:matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}catch{document.documentElement.dataset.theme='dark';}
