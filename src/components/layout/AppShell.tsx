"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Mobile drawer state only: closed by default on mobile screens (< lg)
  // On desktop/laptop (>= lg), sidebar is permanently visible side-by-side
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const toggleMobileDrawer = () => {
    setIsMobileDrawerOpen((prev) => !prev);
  };

  const closeMobileDrawer = () => {
    setIsMobileDrawerOpen(false);
  };

  // Full-screen standalone layout for login and first-time password setup
  const isAuthPage = pathname === "/login" || pathname === "/change-password";

  if (isAuthPage) {
    return (
      <main className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4">
        {children}
      </main>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-slate-900">
      {/* Sidebar: Permanent on desktop/laptop, slide-in drawer on mobile */}
      <Sidebar isOpen={isMobileDrawerOpen} onClose={closeMobileDrawer} />

      {/* Main Content Area: Appears beside the sidebar, not underneath it */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-white">
        <Navbar onToggleSidebar={toggleMobileDrawer} isSidebarOpen={isMobileDrawerOpen} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
