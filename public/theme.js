// Run immediately to prevent FOUC (Flash of Unstyled Content)
(function() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    if (currentTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();

document.addEventListener("DOMContentLoaded", function() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    
    const sunSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    const moonSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

    // Create toggle button
    const btn = document.createElement('button');
    btn.className = 'theme-toggle-btn';
    btn.innerHTML = currentTheme === 'dark' ? moonSvg : sunSvg;
    document.body.appendChild(btn);

    // Dynamic Logo Swapping
    function updateLogos(theme) {
        // Find all images using KelselPDF.png or KelselPDF 2.png
        const logos = document.querySelectorAll('img[alt="KelselPDF Logo"]');
        logos.forEach(logo => {
            const currentSrc = logo.getAttribute('src');
            // Extract the path up to the filename to preserve relative dir structure
            const basePath = currentSrc.substring(0, currentSrc.lastIndexOf('/') + 1);
            logo.src = theme === 'dark' ? basePath + 'KelselPDF%202.png' : basePath + 'KelselPDF.png';
        });
    }

    // Call once on load to set initial state
    updateLogos(currentTheme);

    // Toggle logic
    btn.addEventListener('click', function() {
        let theme = document.documentElement.getAttribute('data-theme');
        if (theme === 'dark') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            btn.innerHTML = sunSvg;
            updateLogos('light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = moonSvg;
            updateLogos('dark');
        }
    });
});
