import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'autowa_super_secret_jwt_key_2026';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

export const authMiddleware = (req, res, next) => {
  // Allow public endpoints
  if (req.path === '/login' || req.path === '/status') {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Akses ditolak! Silakan login terlebih dahulu.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesi login telah kadaluarsa atau tidak valid! Silakan login kembali.' });
  }
};
