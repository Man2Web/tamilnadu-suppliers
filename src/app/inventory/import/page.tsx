"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Package, ArrowLeft } from "lucide-react";

export default function ExcelImportPage() {
  const router = useRouter();

  useEffect(() => {
    // Excel Import has been deprecated and removed. Redirect to Product Master.
    router.replace("/inventory/products");
  }, [router]);

  return (
    <div className="max-w-md mx-auto my-16 text-center space-y-4 p-8 bg-white border border-slate-200 rounded-xl shadow-xs">
      <Package className="w-10 h-10 text-blue-600 mx-auto" />
      <h2 className="text-base font-bold text-slate-900">Excel Product Import Removed</h2>
      <p className="text-xs text-slate-500">
        Products are now managed directly through the centralized Product Master. Redirecting you now...
      </p>
      <Link
        href="/inventory/products"
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Go to Product Master
      </Link>
    </div>
  );
}
