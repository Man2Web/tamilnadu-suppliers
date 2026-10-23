"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Package,
  Users,
  FileText,
  Receipt,
  Truck,
  RotateCcw,
  IndianRupee,
  BarChart3,
  Boxes,
  UserCog,
  ShieldCheck,
  X,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { ModulePermissionId } from "@/lib/types/permissions";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface MenuItem {
  name: string;
  href: string;
  icon: any;
  permission: ModulePermissionId;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { currentUser, hasPermission, isSuperAdmin } = useAuth();

  // Close sidebar on Escape key press (on mobile drawer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const allSections: MenuSection[] = [
    {
      title: "Core",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard:view" },
        { name: "Company Management", href: "/companies", icon: Building2, permission: "companies:manage" },
        { name: "Account Management", href: "/admin/users", icon: UserCog, permission: "users:manage" },
        { name: "Login Activity & Sessions", href: "/admin/sessions", icon: ShieldCheck, permission: "users:manage" },
      ],
    },
    {
      title: "Rental Inventory",
      items: [
        { name: "Shared Products Master", href: "/inventory/products", icon: Package, permission: "products:view" },
        { name: "Stock Availability", href: "/inventory/availability", icon: Boxes, permission: "inventory:availability" },
      ],
    },
    {
      title: "Clients",
      items: [
        { name: "Customer Master", href: "/customers", icon: Users, permission: "customers:view" },
      ],
    },
    {
      title: "Sales & Billing",
      items: [
        { name: "Quotations", href: "/quotations", icon: FileText, permission: "quotations:view" },
        { name: "Bills & Invoices", href: "/bills", icon: Receipt, permission: "bills:view" },
      ],
    },
    {
      title: "Logistics & Returns",
      items: [
        { name: "Gate Passes & Dispatch", href: "/operations/gate-passes", icon: Truck, permission: "bills:view" },
        { name: "Returns & Damages", href: "/operations/returns", icon: RotateCcw, permission: "returns:process" },
      ],
    },
    {
      title: "Finance & Accounts",
      items: [
        { name: "Payments & Deposits", href: "/finance/payments", icon: IndianRupee, permission: "payments:record" },
        { name: "Reports & Registers", href: "/reports", icon: BarChart3, permission: "bills:view" },
      ],
    },
  ];

  // Filter sections and items based on the active user's permissions
  const filteredSections = allSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasPermission(item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <>
      {/* Mobile Drawer Backdrop overlay - tapping outside closes drawer */}
      {isOpen && (
        <div
          onClick={onClose}
          aria-label="Close sidebar backdrop"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200 lg:hidden"
        />
      )}

      {/*
        Sidebar Container:
        - Desktop (>= lg): Permanently visible (lg:static, lg:translate-x-0, lg:shrink-0), fixed width w-64,
          stays fixed while main content scrolls beside it.
        - Mobile (< lg): Hidden by default (-translate-x-full), fixed slide-in drawer on tap.
      */}
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:translate-x-0 lg:shrink-0 ${
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Brand Header with Mobile Close Icon */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-base shadow-xs">
              T
            </div>
            <div>
              <div className="font-bold text-sm tracking-wide text-slate-900 leading-tight">TAMILNADU SUPPLIERS</div>
              <div className="text-[10px] text-blue-600 font-bold tracking-wider uppercase">Rental Management</div>
            </div>
          </div>

          {/* Close Icon (X) button: Strictly mobile only (lg:hidden) */}
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links with Granular Permission Filtering */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {filteredSections.map((section) => (
            <div key={section.title}>
              <div className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                        isActive
                          ? "bg-blue-600 text-white font-semibold shadow-xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-500"}`} />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {filteredSections.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              No navigation modules permitted for this account.
            </div>
          )}
        </div>

      </aside>
    </>
  );
}
