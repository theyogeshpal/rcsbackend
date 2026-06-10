import { Router } from 'express';
import { Contact } from '../models/Contact.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.post('/upload', async (req, res) => {
  try {
    const { numbers, category } = req.body;
    if (!Array.isArray(numbers) || numbers.length === 0 || !category) {
      return res.status(400).json({ error: 'numbers[] and category are required' });
    }

    const normalized = numbers.map((n) => String(n).replace(/\D/g, '')).filter(Boolean);
    const uniqueNumbers = [...new Set(normalized)];

    // Prepare for bulk insert (ignoring duplicates if we wanted to enforce unique index, 
    // but here we just insert them or avoid duplicates in the same payload)
    const docs = uniqueNumbers.map(n => ({ phoneNumber: n, category: category.trim() }));
    
    // We could do a bulk insert. To avoid duplicate numbers in the same category,
    // we could delete existing ones for this category or just insert.
    // For simplicity, we'll just insert.
    await Contact.insertMany(docs);

    res.status(201).json({ success: true, count: docs.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const categories = await Contact.distinct('category');
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const total = await Contact.countDocuments();
    const contacts = await Contact.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    
    res.json({
      contacts,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/delete-bulk', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids[] is required' });
    }
    const result = await Contact.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
