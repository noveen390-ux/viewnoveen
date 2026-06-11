'use client';

export default function DiscoverPage() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-white mb-6">Discover</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-surface-900/50 border border-surface-800 rounded-xl overflow-hidden hover:border-brand-500/30 transition-all group"
            >
              <div className="aspect-video bg-surface-800 flex items-center justify-center">
                <span className="text-surface-600 text-sm">Featured Room {i}</span>
              </div>
              <div className="p-4">
                <h3 className="text-white font-semibold group-hover:text-brand-400 transition-colors">
                  Trending Room {i}
                </h3>
                <p className="text-sm text-surface-400 mt-1">Live with 12 watching</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
