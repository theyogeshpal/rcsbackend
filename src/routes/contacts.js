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
    const contacts = await Contact.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json(contacts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
