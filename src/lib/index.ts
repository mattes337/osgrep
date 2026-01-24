/**
 * osgrep library exports
 *
 * This module exports the core components of osgrep for use as a library.
 * Use these for building custom semantic search applications.
 */

// ============================================================================
// Embedding Models
// ============================================================================

export { GraniteModel } from './workers/embeddings/granite.js';
export { ColbertModel } from './workers/embeddings/colbert.js';

// ============================================================================
// Storage
// ============================================================================

export { VectorDB } from './store/vector-db.js';
export { MetaCache } from './store/meta-cache.js';

// ============================================================================
// Search
// ============================================================================

export { Searcher } from './search/searcher.js';

// ============================================================================
// Worker Pool (for parallel processing)
// ============================================================================

export {
  getWorkerPool,
  destroyWorkerPool,
  isWorkerPoolInitialized,
  WorkerPool,
} from './workers/pool.js';

// ============================================================================
// Types
// ============================================================================

export type {
  VectorRecord,
  PreparedChunk,
  FileMetadata,
  ChunkType,
  SearchResponse,
  SearchFilter,
} from './store/types.js';

// ============================================================================
// Configuration
// ============================================================================

export { CONFIG, MODEL_IDS, PATHS } from '../config.js';

// ============================================================================
// Utilities
// ============================================================================

export { escapeSqlString, normalizePath } from './utils/filter-builder.js';
