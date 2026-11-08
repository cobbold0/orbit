export default function RootLoading() {
  return (
    <div className="min-h-screen bg-base-100 animate-pulse">
      {/* Top navigation skeleton */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-base-300/60 bg-base-100/90 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-7 w-20 rounded-md bg-base-200" />
          <div className="hidden h-5 w-px bg-base-300 md:block" />
          <div className="hidden h-5 w-44 rounded-md bg-base-200 md:block" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-base-200" />
          <div className="h-8 w-8 rounded-full bg-base-200" />
        </div>
      </div>

      {/* Main page content skeleton */}
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded-lg bg-base-200" />
            <div className="h-4 w-32 rounded bg-base-200/70" />
          </div>
          <div className="h-8 w-24 rounded-full bg-base-200" />
        </div>

        {/* Primary card skeleton */}
        <div className="rounded-2xl border border-base-300/70 bg-base-100 p-5 shadow-xs space-y-4">
          <div className="h-5 w-32 rounded bg-base-200" />
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-base-200">
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-3/5 rounded bg-base-200" />
                <div className="h-3 w-1/4 rounded bg-base-200/60" />
              </div>
              <div className="h-8 w-20 rounded-lg bg-base-200" />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-base-200">
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-1/2 rounded bg-base-200" />
                <div className="h-3 w-1/3 rounded bg-base-200/60" />
              </div>
              <div className="h-8 w-20 rounded-lg bg-base-200" />
            </div>
          </div>
        </div>

        {/* Secondary card skeleton */}
        <div className="rounded-2xl border border-base-300/70 bg-base-100 p-5 shadow-xs space-y-3">
          <div className="h-5 w-24 rounded bg-base-200" />
          <div className="h-14 rounded-xl bg-base-200/50" />
        </div>
      </main>
    </div>
  );
}
