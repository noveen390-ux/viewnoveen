'use client';

export default function DiscoverPage() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-foreground mb-6">Discover</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="surface-card overflow-hidden hover:border-primary/30 transition-all group"
            >
              <div className="aspect-video bg-muted flex items-center justify-center">
                <span className="text-muted-foreground/60 text-sm">Featured Room {i}</span>
              </div>
              <div className="p-4">
                <h3 className="text-foreground font-semibold group-hover:text-primary transition-colors">
                  Trending Room {i}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Live with 12 watching</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
