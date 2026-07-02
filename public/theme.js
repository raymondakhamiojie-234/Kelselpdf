// Run immediately to prevent FOUC (Flash of Unstyled Content)
(function() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    if (currentTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();

document.addEventListener("DOMContentLoaded", function() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    
    // Create toggle button
    const btn = document.createElement('button');
    btn.className = 'theme-toggle-btn';
    btn.innerHTML = currentTheme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
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
            btn.innerHTML = '🌙 Dark Mode';
            updateLogos('light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = '☀️ Light Mode';
            updateLogos('dark');
        }
    });
});
