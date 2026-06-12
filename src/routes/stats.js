import { Router } from 'express';
import { Campaign } from '../models/Campaign.js';
import { Contact } from '../models/Contact.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    // Total Contacts
    const totalContacts = await Contact.countDocuments();

    // Contacts by Category
    const categoryBreakdown = await Contact.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const formattedCategories = categoryBreakdown.map(c => ({
      name: c._id || 'Uncategorized',
      value: c.count
    }));

    // Campaign Stats
    const totalCampaigns = await Campaign.countDocuments();
    const campaignAggregation = await Campaign.aggregate([
      {
        $group: {
          _id: null,
          totalSent: { $sum: "$stats.sent" },
          totalFailed: { $sum: "$stats.failed" },
          totalPending: { 
            $sum: {
              $cond: [
                { $in: ["$status", ["completed", "failed"]] },
                0,
                "$stats.pending"
              ]
            }
          }
        }
      }
    ]);

    const stats = campaignAggregation[0] || { totalSent: 0, totalFailed: 0, totalPending: 0 };

    res.json({
      success: true,
      data: {
        contacts: {
          total: totalContacts,
          categories: formattedCategories
        },
        campaigns: {
          total: totalCampaigns,
          sent: stats.totalSent,
          failed: stats.totalFailed,
          pending: stats.totalPending
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
