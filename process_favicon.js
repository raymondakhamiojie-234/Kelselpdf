const { Jimp, HorizontalAlign, VerticalAlign } = require('jimp');
const path = require('path');

const inputPath = path.join(__dirname, 'public/acct/img/KelselPDF 1.png');
const darkOutputPath = path.join(__dirname, 'public/acct/img/favicon-dark.png');
const lightOutputPath = path.join(__dirname, 'public/acct/img/favicon-light.png');

async function processFavicon() {
    try {
        console.log('Loading image...');
        const image = await Jimp.read(inputPath);
        
        // Resize to a square 128x128. Since it's too wide, we use contain to fit it.
        image.contain({ w: 128, h: 128, align: HorizontalAlign.CENTER, valig: VerticalAlign.MIDDLE });
        
        // Save the normal version (for light theme, usually dark logo is fine)
        await image.write(darkOutputPath);
        console.log('Saved favicon-dark.png');

        // Create the inverted version for dark theme
        const inverted = image.clone().invert();
        await inverted.write(lightOutputPath);
        console.log('Saved favicon-light.png');
        
    } catch (err) {
        console.error('Error processing favicon:', err);
    }
}

processFavicon();
