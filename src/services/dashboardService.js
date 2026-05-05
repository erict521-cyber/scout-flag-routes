export function getDashboardStats(routes) {
  const stops = routes.flatMap((route) => route.stops)

  return {
    routeCount: routes.length,
    stopCount: stops.length,
    postedCount: stops.filter((stop) => stop.posted).length,
    pickedUpCount: stops.filter((stop) => stop.pickedUp).length,
    issueCount: stops.filter((stop) => stop.comment).length,
    unfinishedStops: stops.filter((stop) => !stop.posted || !stop.pickedUp),
  }
}
