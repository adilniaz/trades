import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-24" />
      <div className="flex gap-4">
        <Skeleton className="h-20 w-64 rounded-lg" />
        <Skeleton className="h-20 w-64 rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
