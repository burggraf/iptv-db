// Cascade delete all sources and related data
routerAdd('POST', '/api/cascade-delete', (c) => {
  const app = $app;
  
  try {
    // Delete sync jobs first (they reference sources)
    const syncJobs = app.findRecordsByFilter('sync_jobs', '1=1');
    for (const job of syncJobs) {
      app.delete(job);
    }
    
    // Delete channels, movies, series (they reference sources via categories or directly)
    const channels = app.findRecordsByFilter('channels', '1=1');
    for (const ch of channels) {
      app.delete(ch);
    }
    
    const movies = app.findRecordsByFilter('movies', '1=1');
    for (const mv of movies) {
      app.delete(mv);
    }
    
    const series = app.findRecordsByFilter('series', '1=1');
    for (const sr of series) {
      app.delete(sr);
    }
    
    // Delete episodes
    const episodes = app.findRecordsByFilter('episodes', '1=1');
    for (const ep of episodes) {
      app.delete(ep);
    }
    
    // Delete categories
    const categories = app.findRecordsByFilter('categories', '1=1');
    for (const cat of categories) {
      app.delete(cat);
    }
    
    // Finally delete all sources
    const sources = app.findRecordsByFilter('sources', '1=1');
    for (const src of sources) {
      app.delete(src);
    }
    
    return c.json(200, { 
      message: 'All sources and related data deleted successfully',
      deleted: {
        sources: sources.length,
        channels: channels.length,
        movies: movies.length,
        series: series.length,
        episodes: episodes.length,
        categories: categories.length,
        sync_jobs: syncJobs.length
      }
    });
  } catch (err) {
    console.error('Cascade delete error:', err);
    return c.json(500, { message: 'Failed to delete sources: ' + err.message });
  }
});
