/**
 * Search feature — public surface.
 *
 * The dialog is imported by the app shell rather than mounted on a route: search
 * is available from every screen, and a results page would lose the caller's
 * place for what is nearly always a jump to somewhere else.
 */

export { SearchDialog } from './components/search-dialog';
export { globalSearch, type SearchHit, type SearchKind } from './api/search.service';
