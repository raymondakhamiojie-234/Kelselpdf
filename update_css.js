const fs = require('fs');

let css = fs.readFileSync('public/style.css', 'utf8');

// The first `.app-header-curved` definition:
const headerOld = `.app-header-curved {
    background: linear-gradient(135deg, #1E3A8A 0%, #8b5cf6 100%);
    color: white;
    padding: 3rem 1.5rem 4rem 1.5rem;
    border-bottom-left-radius: 30px;
    border-bottom-right-radius: 30px;
    position: relative;
    margin-bottom: 3rem;
}`;
const headerNew = `.app-header-curved {
    background: linear-gradient(135deg, #1E3A8A 0%, #8b5cf6 100%);
    color: white;
    padding: 3rem 3rem 4rem 3rem;
    border-bottom-left-radius: 30px;
    border-bottom-right-radius: 30px;
    position: relative;
    margin-bottom: 3rem;
    margin-left: -3rem;
    margin-right: -3rem;
}`;

if (css.includes(headerOld)) {
    css = css.replace(headerOld, headerNew);
} else {
    // try line by line replace for app-header-curved
    console.log("Could not find exact match for app-header-curved, fallback");
    let regex = /\.app-header-curved\s*\{[\s\S]*?margin-bottom:\s*3rem;\s*\}/;
    css = css.replace(regex, headerNew);
}

// Check main-content
let mainContentOld = `.main-content {
    flex: 1;
    padding: 2rem;
    margin-left: 250px;
    min-height: 100vh;
}`;
let mainContentNew = `.main-content {
    flex: 1;
    padding: 0 3rem 3rem 3rem;
    margin-left: 250px;
    min-height: 100vh;
    max-width: 100%;
    overflow-x: hidden;
}`;
if (css.includes(mainContentOld)) {
    css = css.replace(mainContentOld, mainContentNew);
} else {
    let regex = /\.main-content\s*\{[\s\S]*?min-height:\s*100vh;\s*\}/;
    css = css.replace(regex, mainContentNew);
}

fs.writeFileSync('public/style.css', css, 'utf8');
console.log('CSS Updated via advanced replacement');
