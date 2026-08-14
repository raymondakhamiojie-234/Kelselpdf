const fs = require('fs');
const code = `
exports.trackMaterialDownload = async (req, res) => {
    try {
        const material_id = req.params.id;
        const [material] = await require('../config/db').query('SELECT file_link FROM past_questions WHERE id = ?', [material_id]);
        if (material.length === 0) return res.status(404).send('Material not found');

        await require('../config/db').query('INSERT INTO material_downloads (user_id, material_id) VALUES (?, ?)', [req.session.user_id, material_id]);

        const file_link = material[0].file_link;
        const filePath = (file_link.startsWith('http') || file_link.startsWith('data:')) ? file_link : '/' + file_link;
        res.redirect(filePath);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
`;
fs.appendFileSync('src/controllers/examController.js', code);
