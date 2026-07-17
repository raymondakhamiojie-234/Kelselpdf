const express = require('express');
const router = express.Router();
const materialController = require('../controllers/materialController');
const { checkAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const os = require('os');

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

router.get('/my_materials', checkAuth, materialController.getMyMaterials);
router.post('/my_materials/upload', checkAuth, upload.single('material_file'), materialController.uploadMaterial);
router.post('/api/ai/material_explain', checkAuth, materialController.explainMaterial);
router.post('/api/ai/material_exam', checkAuth, materialController.generateExam);

module.exports = router;
