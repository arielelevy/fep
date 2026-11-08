// Pruebas de tests/clima/ (config común en tests/vitest.base.ts).
//   node node_modules/vitest/vitest.mjs run --config tests/clima/vitest.config.ts
import { configCarpeta } from '../vitest.base';

export default configCarpeta('clima', 'tests/clima/setup.ts');
