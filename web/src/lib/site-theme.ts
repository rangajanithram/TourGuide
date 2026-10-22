const storageKey = 'tripweave-theme';
// Runs before the page paints, including on routes that do not use the main header.
export const themeScript = `(function(){var t;try{t=localStorage.getItem('${storageKey}')}catch(e){}document.documentElement.dataset.theme=t==='dark'||t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'})()`;
