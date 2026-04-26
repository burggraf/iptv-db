// Cascade delete all sources in batches to avoid timeout
routerAdd('POST', '/api/cascade-delete', (c) => {
  const app = $app;
  const BATCH_SIZE = 10;
  
  try {
    // Delete sync jobs first (no cascade FK, must delete manually)
    const syncJobs = app.findRecordsByFilter('sync_jobs', '1=1');
    for (const job of syncJobs) {
      app.delete(job);
    }
    
    // Delete sources in batches - PocketBase cascades to channels, movies, series, episodes, categories via foreign keys
    let totalDeleted = 0;
    
    while (true) {
      const result = app.dao().db().newQuery(`SELECT id FROM sources LIMIT ${BATCH_SIZE}`).all();
      if (result.length === 0) break;
      
      for (const row of result) {
        const src = app.findRecordById('sources', row.id);
        if (src) {
          app.delete(src);
          totalDeleted++;
        }
      }
    }
    
    return c.json(200, { 
      message: 'All sources and related data deleted successfully',
      deleted: {
        sources: totalDeleted,
        sync_jobs: syncJobs.length
      }
    });
  } catch (err) {
    console.error('Cascade delete error:', err);
    return c.json(500, { message: 'Failed to delete sources: ' + err.message });
  }
});
