function registerSecurityCenter(app, { requireAdmin, AuditLog }) {
  app.get('/api/admin/security/audit', requireAdmin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.query.actorRole && req.query.actorRole !== 'software_development') return res.status(400).json({ message: 'Unsupported activity filter.' });
    // Newest 400 by default (the full history can be thousands of rows); up to 1,000 on request.
    const limit = req.query.limit === undefined ? 400 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return res.status(400).json({ message: 'Choose a valid activity page size.' });
    try {
      const filter = { action: { $ne: 'club_import_undo_state' },
        ...(req.query.actorRole === 'software_development' ? { actorRole: 'software_development' } : {}) };
      let query = AuditLog.find(filter).select('actorEmail actorRole action targetType targetId details timestamp -_id').sort({ timestamp: -1 });
      query = query.limit(limit);
      const logs = await query.lean();
      res.json({ googleSignInConfigured: Boolean(process.env.GOOGLE_CLIENT_ID), logs });
    } catch { res.status(503).json({ message: 'Security activity is temporarily unavailable.' }); }
  });
}
module.exports = { registerSecurityCenter };
