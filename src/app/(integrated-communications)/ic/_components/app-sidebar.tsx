import * as React from "react";
import { type ComponentProps } from "react";
import { AppSidebarClient } from "@/components/shared/app-sidebar/app-sidebar-client";
import { getSidebarNavigation } from "@/actions/app-sidebar";
import { Sidebar } from "@/components/ui/sidebar";

export async function AppSidebar(props: ComponentProps<typeof Sidebar>) {
    const items = await getSidebarNavigation("ic");

    return (
        <AppSidebarClient
            {...props}
            initialItems={items}
            subsystemTitle="Integrated Communications"
        />
    );
}
