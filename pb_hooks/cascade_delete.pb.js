// Cascade delete all sources - let PocketBase foreign keys handle the rest
routerAdd('POST', '/api/cascade-delete', (c) => {
  const app = $app;
  
  try {
    // Delete sync jobs first (no cascade FK, must delete manually)
    const syncJobs = app.findRecordsByFilter('sync_jobs', '1=1');
    for (const job of syncJobs) {
      app.delete(job);
    }
    
    // Delete sources - PocketBase cascades to channels, movies, series, episodes, categories via foreign keys
    const sources = app.findRecordsByFilter('sources', '1=1');
    for (const src of sources) {
      app.delete(src);
    }
    
    return c.json(200, { 
      message: 'All sources and related data deleted successfully',
      deleted: {
        sources: sources.length,
        sync_jobs: syncJobs.length
      }
    });
  } catch (err) {
    console.error('Cascade delete error:', err);
    return c.json(500, { message: 'Failed to delete sources: ' + err.message });
  }
});
