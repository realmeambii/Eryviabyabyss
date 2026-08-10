/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Types — the single source of truth for row shapes.
 * ═══════════════════════════════════════════════════════════════════════════
 *  `database.types.ts` is generated. Regenerate it after every migration:
 *
 *      npm run db:types            # against the local stack
 *      npm run db:types:remote     # against the linked project
 *
 *  Nothing in `src/` should redeclare a table's shape. Derive instead:
 *
 *      import type { Tables } from '@/shared/types';
 *      type Student = Tables<'students'>;
 *
 *  Nothing hand-written may live in the generated file — a regeneration
 *  silently deletes it, and the first sign is a build failure in whatever
 *  imported it. The helpers the CLI does not emit are therefore declared here,
 *  where they survive. (It is also why this file, not that one, carries the
 *  instructions above: they would be gone the first time they were followed.)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { Database } from './database.types';

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from './database.types';

type PublicSchema = Database['public'];

/** Every RPC in the public schema, keyed by name. */
export type DbFunctions = PublicSchema['Functions'];

export type FunctionArgs<T extends keyof DbFunctions> = DbFunctions[T]['Args'];

export type FunctionReturns<T extends keyof DbFunctions> = DbFunctions[T]['Returns'];

export type TableName = keyof PublicSchema['Tables'];

export * from './domain';
