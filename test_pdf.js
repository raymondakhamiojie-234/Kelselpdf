const fs = require('fs');
const pdf = require('pdf-parse');
const https = require('https');

const sources = [
    { prog: 'Computer Science', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/04/computer-science-Hand-Book.pdf' },
    { prog: 'Accounting', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/Department-of-Accounting-Handbook-.pdf' }
];

async function downloadPDF(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function extract() {
    for (const src of sources) {
        console.log("Downloading", src.prog);
        const file = `temp_${src.prog.replace(/\s+/g, '_')}.pdf`;
        await downloadPDF(src.url, file);
        let dataBuffer = fs.readFileSync(file);
        let data = await pdf(dataBuffer);
        console.log(`--- ${src.prog} Extracted ---`);
        console.log(data.text.substring(0, 1000));
    }
}
extract();
