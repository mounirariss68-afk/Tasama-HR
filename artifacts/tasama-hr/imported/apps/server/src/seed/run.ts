import { reseed } from './index.js';
import { pool } from '../db.js';

reseed()
  .then(() => pool.end())
  .catch((e) => { console.error(e); process.exit(1); });
