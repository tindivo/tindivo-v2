export function AccountSkeleton() {
  return (
    <div className="px-4 pt-2">
      <div className="h-[164px] animate-pulse rounded-[22px] bg-card" />
      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="h-[100px] animate-pulse rounded-[18px] bg-card" />
        <div className="h-[100px] animate-pulse rounded-[18px] bg-card" />
        <div className="h-[100px] animate-pulse rounded-[18px] bg-card" />
      </div>
      <div className="mt-5 h-[120px] animate-pulse rounded-[18px] bg-card" />
      <div className="mt-5 h-[280px] animate-pulse rounded-[18px] bg-card" />
    </div>
  )
}
