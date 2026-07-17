import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { _electron as electron, expect, test } from "@playwright/test";

test("uses the desktop bridge for the inbox, secure reading, search, compose, and settings", async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), "fluxmail-e2e-"));
  const electronApp = await electron.launch({
    args: [process.cwd()],
    env: {
      ...process.env,
      FLUXMAIL_DESKTOP_FAKE_MAIL: "1",
      FLUXMAIL_DESKTOP_FAKE_ARCHIVE_DELAY_MS: "600",
      FLUXMAIL_DESKTOP_E2E_HEADLESS: "1",
      FLUXMAIL_DESKTOP_TEST_DATA_DIR: dataDirectory,
      FLUXMAIL_DATA_DIR: path.join(dataDirectory, ".fluxmail"),
      // The development analytics transport remains disabled, while Settings can exercise the
      // shared preference without an environment-enforced lock.
      FLUXMAIL_TELEMETRY: "1",
    },
  });

  try {
    const page = await electronApp.firstWindow();
    expect(await electronApp.evaluate(({ app }) => app.getName())).toBe("Fluxmail");
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(page.getByText("Welcome to Fluxmail", { exact: true }).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('14px "Fluxmail Inter"'))).toBe(true);
    await expect(page.locator(".sidebar .brand")).toHaveCount(0);
    await expect(page.locator(".reading-placeholder .brand-mark")).toHaveCount(0);
    await expect(page.locator(".reading-placeholder")).toHaveCSS("user-select", "none");
    await expect(page.locator(".account-picker-icon")).toHaveCount(0);
    await expect(page.getByText(/connected$/)).toHaveCount(0);
    await expect(page.locator(".sidebar").getByRole("button", { name: "Receipts" })).toHaveCount(0);
    const accountPicker = page.getByRole("button", { name: "Choose account" });
    await expect(accountPicker.locator(".lucide-chevrons-up-down")).toBeVisible();
    await accountPicker.click();
    await expect(page.getByRole("menuitem", { name: "All accounts" })).toBeVisible();
    await accountPicker.click();
    await expect(page.locator(".sidebar")).toHaveCSS("user-select", "none");
    const inboxNav = page.locator(".sidebar").getByRole("button", { name: "Inbox" });
    const starredNav = page.getByRole("button", { name: "Starred" });
    await accountPicker.hover();
    await expect
      .poll(async () => {
        const [accountBackground, activeBackground] = await Promise.all([
          accountPicker.evaluate((node) => getComputedStyle(node).backgroundColor),
          inboxNav.evaluate((node) => getComputedStyle(node).backgroundColor),
        ]);
        return accountBackground === activeBackground;
      })
      .toBe(true);
    await starredNav.hover();
    await expect(inboxNav).toHaveCSS("border-top-width", "0px");
    await expect
      .poll(async () => {
        const [activeBackground, hoverBackground] = await Promise.all([
          inboxNav.evaluate((node) => getComputedStyle(node).backgroundColor),
          starredNav.evaluate((node) => getComputedStyle(node).backgroundColor),
        ]);
        return activeBackground === hoverBackground;
      })
      .toBe(true);
    await expect(page.locator(".thread-row").first()).toHaveCSS("user-select", "none");
    await expect(page.locator(".search-box")).toHaveCSS("height", "34px");
    const sidebarCompose = page.locator(".sidebar-titlebar").getByRole("button", {
      name: "Compose",
    });
    await expect(sidebarCompose).toHaveCSS("cursor", "default");
    await expect(sidebarCompose).toHaveCSS("box-shadow", "none");
    await expect(sidebarCompose.locator(".lucide-pencil")).toBeVisible();
    const sidebarSettingsButton = page.getByRole("button", {
      name: "Settings",
    });
    const [composeStyle, settingsStyle] = await Promise.all(
      [sidebarCompose, sidebarSettingsButton].map((button) =>
        button.evaluate((node) => ({
          background: getComputedStyle(node).backgroundColor,
          color: getComputedStyle(node).color,
          width: getComputedStyle(node).width,
          height: getComputedStyle(node).height,
        })),
      ),
    );
    expect(composeStyle).toEqual(settingsStyle);
    await expect(sidebarCompose).toHaveAttribute("aria-keyshortcuts", "C");
    await sidebarCompose.hover();
    const composeTooltip = page.getByRole("tooltip", { name: "Compose" });
    await expect(composeTooltip).toBeVisible();
    await expect(composeTooltip.locator("kbd")).toHaveText("C");
    await page.locator(".search-box").hover();
    const sidebarComposeLayout = await page.evaluate(() => {
      const sidebar = document.querySelector<HTMLElement>(".sidebar")!.getBoundingClientRect();
      const compose = document
        .querySelector<HTMLElement>(".sidebar-titlebar [aria-label='Compose']")!
        .getBoundingClientRect();
      const account = document
        .querySelector<HTMLElement>(".account-picker-trigger")!
        .getBoundingClientRect();
      const search = document.querySelector<HTMLElement>(".search-box")!.getBoundingClientRect();
      return {
        width: compose.width,
        height: compose.height,
        rightInset: sidebar.right - compose.right,
        composeBottom: compose.bottom,
        composeCenterY: compose.top + compose.height / 2,
        accountTop: account.top,
        searchCenterY: search.top + search.height / 2,
      };
    });
    expect(sidebarComposeLayout).toMatchObject({
      width: 31,
      height: 31,
      rightInset: 8,
    });
    expect(sidebarComposeLayout.composeBottom).toBeLessThanOrEqual(sidebarComposeLayout.accountTop);
    expect(
      sidebarComposeLayout.accountTop - sidebarComposeLayout.composeBottom,
    ).toBeLessThanOrEqual(8);
    expect(sidebarComposeLayout.searchCenterY).toBe(sidebarComposeLayout.composeCenterY);
    const sidebarHeaderButtonOrder = await page
      .locator(".sidebar-titlebar button")
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
    expect(sidebarHeaderButtonOrder).toEqual(["Collapse sidebar", "Compose"]);
    await expect(page.locator(".sidebar-footer").getByRole("button")).toHaveCount(1);
    await expect(
      page.locator(".sidebar-footer").getByRole("button", { name: "Settings" }),
    ).toBeVisible();
    await expect(page.getByRole("separator", { name: "Resize sidebar" })).toBeVisible();
    const sidebarNav = page.locator(".sidebar-nav");
    await expect(sidebarNav.locator(".nav-item").first()).toHaveCSS("flex-shrink", "0");
    await expect(sidebarNav.locator(".nav-item").first()).toHaveCSS("height", "36px");
    await sidebarNav.evaluate((element) => {
      let position = 0;
      Object.defineProperties(element, {
        clientHeight: { configurable: true, get: () => 100 },
        scrollHeight: { configurable: true, get: () => 500 },
        scrollTop: {
          configurable: true,
          get: () => position,
          set: (value: number) => {
            position = value;
          },
        },
      });
      element.dispatchEvent(new Event("scroll"));
    });
    await expect(page.locator(".sidebar-fade.bottom")).toBeVisible();
    await expect(page.locator(".sidebar-fade.top")).toHaveCount(0);
    await sidebarNav.evaluate((element) => {
      (element as HTMLElement).scrollTop = 100;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect(page.locator(".sidebar-fade.top")).toBeVisible();
    await sidebarNav.evaluate((element) => {
      Reflect.deleteProperty(element, "clientHeight");
      Reflect.deleteProperty(element, "scrollHeight");
      Reflect.deleteProperty(element, "scrollTop");
      element.dispatchEvent(new Event("scroll"));
    });
    const initialCollapseSidebar = page.getByRole("button", {
      name: "Collapse sidebar",
    });
    await expect(initialCollapseSidebar.locator(".lucide-panel-left")).toBeVisible();
    await expect(initialCollapseSidebar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.getByRole("button", { name: "Settings" })).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await initialCollapseSidebar.click();
    await expect(page.locator(".sidebar")).toHaveClass(/collapsed/);
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.getByRole("separator", { name: "Resize sidebar" })).toHaveCount(0);
    const expandSidebar = page.getByRole("button", { name: "Expand sidebar" });
    const headerCompose = page.locator(".header-quick-actions").getByRole("button", {
      name: "Compose",
    });
    await expect(expandSidebar).toBeVisible();
    await expect(expandSidebar.locator(".lucide-panel-left")).toBeVisible();
    await expect(headerCompose).toBeVisible();
    await expect(headerCompose.locator(".lucide-pencil")).toBeVisible();
    expect(
      await headerCompose.evaluate((node) => ({
        background: getComputedStyle(node).backgroundColor,
        color: getComputedStyle(node).color,
        width: getComputedStyle(node).width,
        height: getComputedStyle(node).height,
      })),
    ).toEqual(composeStyle);
    const collapsedHeaderBounds = await page.evaluate(() => {
      const expand = document
        .querySelector<HTMLElement>('.header-quick-actions [aria-label="Expand sidebar"]')!
        .getBoundingClientRect();
      const compose = document
        .querySelector<HTMLElement>('.header-quick-actions [aria-label="Compose"]')!
        .getBoundingClientRect();
      const search = document.querySelector<HTMLElement>(".search-box")!.getBoundingClientRect();
      return {
        expandLeft: expand.left,
        expandRight: expand.right,
        expandCenterY: expand.top + expand.height / 2,
        composeLeft: compose.left,
        composeRight: compose.right,
        composeCenterY: compose.top + compose.height / 2,
        searchLeft: search.left,
        searchCenterY: search.top + search.height / 2,
      };
    });
    expect(collapsedHeaderBounds.expandLeft).toBeGreaterThanOrEqual(88);
    expect(
      collapsedHeaderBounds.composeLeft - collapsedHeaderBounds.expandRight,
    ).toBeGreaterThanOrEqual(6);
    expect(
      collapsedHeaderBounds.searchLeft - collapsedHeaderBounds.composeRight,
    ).toBeGreaterThanOrEqual(8);
    expect(collapsedHeaderBounds.expandCenterY).toBe(collapsedHeaderBounds.composeCenterY);
    expect(collapsedHeaderBounds.composeCenterY).toBe(collapsedHeaderBounds.searchCenterY);
    expect(Math.abs(collapsedHeaderBounds.searchCenterY - 24)).toBeLessThanOrEqual(0.5);
    await expect(page.locator(".header-quick-actions")).toHaveCSS("-webkit-app-region", "no-drag");
    await headerCompose.click();
    await expect(page.getByRole("dialog", { name: "New message" })).toBeVisible();
    await page.getByRole("button", { name: "Close compose" }).click();
    const collapsedCheckboxAlignment = await page.evaluate(() => ({
      header: document.querySelector(".header-check .selection-indicator")!.getBoundingClientRect()
        .left,
      row: document.querySelector(".row-check .selection-indicator")!.getBoundingClientRect().left,
    }));
    expect(
      Math.abs(collapsedCheckboxAlignment.header - collapsedCheckboxAlignment.row),
    ).toBeLessThanOrEqual(1);
    await expandSidebar.hover();
    const expandTooltip = page.getByRole("tooltip", { name: "Expand sidebar" });
    await expect(expandTooltip).toBeVisible();
    await expect(expandSidebar).toHaveAttribute("aria-keyshortcuts", "[");
    await expect(expandTooltip.locator("kbd")).toHaveText("[");
    expect(await expandTooltip.evaluate((node) => node.parentElement === document.body)).toBe(true);
    expect(
      await expandTooltip.evaluate((node) => node.getBoundingClientRect().left),
    ).toBeGreaterThanOrEqual(0);
    await expandSidebar.click();
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".header-quick-actions")).toHaveCount(0);
    await expect(page.getByRole("separator", { name: "Resize sidebar" })).toBeVisible();
    await page.locator(".search-box").hover();
    await page.keyboard.press("[");
    await expect(page.locator(".sidebar")).toBeHidden();
    await page.keyboard.press("[");
    await expect(page.locator(".sidebar")).toBeVisible();
    const expandedSpacing = await page.locator(".sidebar-nav .nav-item").evaluateAll((items) => {
      const first = items[0]!.getBoundingClientRect();
      const second = items[1]!.getBoundingClientRect();
      return second.top - first.bottom;
    });
    expect(expandedSpacing).toBeGreaterThanOrEqual(2);
    const collapseSidebar = page.getByRole("button", {
      name: "Collapse sidebar",
    });
    await collapseSidebar.hover();
    await expect(collapseSidebar).toHaveCSS("border-top-width", "0px");
    const collapseTooltip = page.getByRole("tooltip", {
      name: "Collapse sidebar",
    });
    await expect(collapseTooltip).toBeVisible();
    await expect(collapseSidebar).toHaveAttribute("aria-keyshortcuts", "[");
    await expect(collapseTooltip.locator("kbd")).toHaveText("[");
    expect(
      await collapseTooltip.evaluate((node) => node.getBoundingClientRect().left),
    ).toBeGreaterThanOrEqual(0);
    await expect(page.locator(".conversation-count")).toHaveCount(0);
    await expect(page.getByText(/conversations$/)).toHaveCount(0);
    const refreshButton = page.locator(".title-row").getByRole("button", { name: "Refresh" });
    await refreshButton.hover();
    await expect(refreshButton).toHaveCSS("border-top-width", "0px");
    const checkboxAlignment = await page.evaluate(() => ({
      header: document.querySelector(".header-check .selection-indicator")!.getBoundingClientRect()
        .left,
      row: document.querySelector(".row-check .selection-indicator")!.getBoundingClientRect().left,
    }));
    expect(Math.abs(checkboxAlignment.header - checkboxAlignment.row)).toBeLessThanOrEqual(1);
    const headerOrder = await page.evaluate(() => ({
      searchTop: document.querySelector(".search-box")!.getBoundingClientRect().top,
      titleTop: document.querySelector(".title-row")!.getBoundingClientRect().top,
    }));
    expect(headerOrder.searchTop).toBeLessThan(headerOrder.titleTop);
    await expect(page.locator(".thread-header")).toHaveCSS("-webkit-app-region", "drag");
    await expect(page.locator(".search-box")).toHaveCSS("-webkit-app-region", "no-drag");
    await expect(page.locator(".thread-header")).toHaveCSS("border-bottom-width", "0px");
    await expect(page.getByText("Today", { exact: true })).toBeVisible();
    await expect(page.locator(".thread-row").first().locator(".unread-dot")).toBeVisible();
    await expect(page.locator(".thread-row").nth(1).locator(".unread-dot")).toHaveCount(0);
    const listDividerColor = await page
      .locator(".thread-row")
      .first()
      .evaluate((row) => getComputedStyle(row).borderBottomColor);
    const paneResizers = page.locator(".pane-resizer");
    await expect(paneResizers).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      await expect(paneResizers.nth(index)).toHaveCSS("background-color", listDividerColor);
    }
    const rowBackground = await page
      .locator(".thread-row")
      .first()
      .evaluate((row) => getComputedStyle(row).backgroundColor);
    await page.locator(".thread-row").first().hover();
    expect(
      await page
        .locator(".thread-row")
        .first()
        .evaluate((row) => getComputedStyle(row).backgroundColor),
    ).not.toBe(rowBackground);
    const rowArchive = page
      .locator(".thread-row")
      .first()
      .getByRole("button", { name: "Archive conversation" });
    await expect(rowArchive).toBeVisible();
    await expect(page.locator(".thread-row").nth(1).locator(".row-actions")).toHaveCSS(
      "opacity",
      "0",
    );
    await rowArchive.hover();
    const archiveTooltip = page.getByRole("tooltip", {
      name: "Archive conversation",
    });
    await expect(archiveTooltip).toBeVisible();
    await expect(rowArchive).toHaveAttribute("aria-keyshortcuts", "E");
    await expect(archiveTooltip.locator("kbd")).toHaveText("E");
    expect(await archiveTooltip.evaluate((node) => node.parentElement === document.body)).toBe(
      true,
    );
    await expect(
      page.locator(".thread-row").first().getByRole("button", {
        name: "Mark conversation read",
      }),
    ).toBeVisible();
    const listWidths = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>(".thread-row")!;
      const list = document.querySelector<HTMLElement>(".thread-list")!;
      return {
        row: row.getBoundingClientRect().width,
        list: list.getBoundingClientRect().width,
      };
    });
    expect(Math.abs(listWidths.row - listWidths.list)).toBeLessThanOrEqual(1);
    await expect(page.locator('[data-virtuoso-scroller="true"]')).toHaveCSS("overflow-x", "hidden");
    await expect(page.locator('[data-virtuoso-scroller="true"]')).toHaveCSS(
      "scrollbar-width",
      "none",
    );
    const threadScroller = page.locator('[data-virtuoso-scroller="true"]');
    await threadScroller.evaluate((element) => {
      let position = 0;
      Object.defineProperties(element, {
        clientHeight: { configurable: true, get: () => 500 },
        scrollHeight: { configurable: true, get: () => 2_000 },
        scrollTop: {
          configurable: true,
          get: () => position,
          set: (value: number) => {
            position = value;
          },
        },
      });
      element.dispatchEvent(new Event("scroll"));
    });
    await expect(page.locator(".thread-fade.bottom")).toBeVisible();
    await expect(page.locator(".thread-fade.top")).toHaveCount(0);
    await threadScroller.evaluate((element) => {
      (element as HTMLElement).scrollTop = 750;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect(page.locator(".thread-fade.top")).toBeVisible();
    await expect(page.locator(".thread-fade.bottom")).toBeVisible();
    await threadScroller.evaluate((element) => {
      Reflect.deleteProperty(element, "clientHeight");
      Reflect.deleteProperty(element, "scrollHeight");
      Reflect.deleteProperty(element, "scrollTop");
      element.dispatchEvent(new Event("scroll"));
    });
    expect(
      await page
        .locator(".thread-pane")
        .evaluate((pane) =>
          getComputedStyle(pane, "::before").getPropertyValue("-webkit-app-region"),
        ),
    ).toBe("drag");
    const draftsNav = page.locator(".sidebar .nav-item").filter({ hasText: "Drafts" });
    await expect(
      page.locator(".sidebar .nav-item").filter({ hasText: "Inbox" }).locator(".nav-count"),
    ).toHaveText("1");
    await expect(draftsNav.locator(".nav-count")).toHaveText("1");
    const inboxCountFits = await page
      .locator(".sidebar .nav-item")
      .filter({ hasText: "Inbox" })
      .evaluate((item) => {
        const count = item.querySelector<HTMLElement>(".nav-count")!;
        count.textContent = "169";
        const itemBounds = item.getBoundingClientRect();
        const countBounds = count.getBoundingClientRect();
        const itemPaddingRight = Number.parseFloat(getComputedStyle(item).paddingRight);
        return {
          textFits: count.scrollWidth <= count.clientWidth,
          staysInside: countBounds.right <= itemBounds.right - itemPaddingRight,
        };
      });
    expect(inboxCountFits).toEqual({ textFits: true, staysInside: true });
    expect(
      await page
        .locator(".reading-pane")
        .evaluate((pane) =>
          getComputedStyle(pane, "::before").getPropertyValue("-webkit-app-region"),
        ),
    ).toBe("drag");

    await page.getByRole("button", { name: "Spam" }).click();
    await expect(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
    const showedBackgroundSkeleton = await page.evaluate(async () => {
      let showedSkeleton = false;
      const observer = new MutationObserver(() => {
        showedSkeleton ||= Boolean(document.querySelector(".skeleton-list"));
      });
      observer.observe(document.querySelector(".thread-list")!, {
        childList: true,
        subtree: true,
      });
      await window.fluxmail.sync.refresh();
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      observer.disconnect();
      return showedSkeleton;
    });
    expect(showedBackgroundSkeleton).toBe(false);
    await page.getByRole("button", { name: "Inbox" }).click();
    await expect(page.getByText("Welcome to Fluxmail", { exact: true }).first()).toBeVisible();

    const threadListTopBeforeSelection = await page
      .locator(".thread-list")
      .evaluate((node) => node.getBoundingClientRect().top);
    const selectAll = page.getByRole("checkbox", {
      name: "Select all conversations",
    });
    await expect(selectAll).toBeVisible();
    await expect(selectAll).toHaveAttribute("aria-checked", "false");
    const firstSelect = page
      .locator(".thread-row")
      .first()
      .getByRole("checkbox", { name: "Select conversation" });
    await selectAll.hover();
    const selectAllHoverBackground = await selectAll.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    );
    await firstSelect.hover();
    await expect(firstSelect).toHaveCSS("background-color", selectAllHoverBackground);
    const uncheckedIndicatorSize = await firstSelect
      .locator(".selection-indicator")
      .evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      });
    await firstSelect.click();
    await expect(page.locator(".row-check.checked .selection-indicator")).toHaveCSS(
      "background-color",
      "rgb(49, 94, 206)",
    );
    expect(
      await page.locator(".row-check.checked .selection-indicator").evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      }),
    ).toEqual(uncheckedIndicatorSize);
    expect(
      await page.locator(".thread-list").evaluate((node) => node.getBoundingClientRect().top),
    ).toBe(threadListTopBeforeSelection);
    await expect(selectAll).toHaveAttribute("aria-checked", "mixed");
    await expect(page.getByRole("textbox", { name: "Search mail" })).toBeVisible();
    await expect(
      page.locator(".thread-header").getByRole("heading", { name: "Inbox" }),
    ).toHaveCount(0);
    await expect(page.locator(".title-row").getByRole("button", { name: "Refresh" })).toHaveCount(
      0,
    );
    await expect(page.locator(".selection-count")).toHaveText("1 selected");
    await expect(
      page.locator(".selection-actions").getByRole("button", { name: "Mark read" }),
    ).toBeVisible();
    await expect(
      page.locator(".selection-actions").getByRole("button", { name: "Mark unread" }),
    ).toHaveCount(0);
    await expect(
      page.locator(".selection-actions").getByRole("button", { name: "Apply label" }),
    ).toBeVisible();
    const listMoreActions = page
      .locator(".selection-actions")
      .getByRole("button", { name: "More actions" });
    await expect(listMoreActions).toBeVisible();
    await listMoreActions.hover();
    const moreActionsTooltip = page.getByRole("tooltip", {
      name: "More actions",
    });
    await expect(moreActionsTooltip).toBeVisible();
    await expect(moreActionsTooltip.locator("kbd")).toHaveCount(0);
    expect(await moreActionsTooltip.evaluate((node) => node.parentElement === document.body)).toBe(
      true,
    );
    const tooltipBounds = await moreActionsTooltip.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });
    expect(tooltipBounds.left).toBeGreaterThanOrEqual(0);
    expect(tooltipBounds.right).toBeLessThanOrEqual(tooltipBounds.viewportWidth);
    expect(tooltipBounds.top).toBeGreaterThanOrEqual(0);
    expect(tooltipBounds.bottom).toBeLessThanOrEqual(tooltipBounds.viewportHeight);
    await selectAll.click();
    const clearSelection = page.getByRole("checkbox", {
      name: "Clear selection",
    });
    await expect(clearSelection).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".row-check.checked")).toHaveCount(2);
    await clearSelection.click();
    await expect(page.locator(".row-check.checked")).toHaveCount(0);
    await expect(
      page.locator(".thread-header").getByRole("heading", { name: "Inbox" }),
    ).toBeVisible();
    await expect(page.locator(".title-row").getByRole("button", { name: "Refresh" })).toBeVisible();

    const secondSelect = page
      .locator(".thread-row")
      .nth(1)
      .getByRole("checkbox", { name: "Select conversation" });
    await secondSelect.click();
    await expect(
      page.locator(".selection-actions").getByRole("button", { name: "Mark unread" }),
    ).toBeVisible();
    await expect(
      page.locator(".selection-actions").getByRole("button", { name: "Mark read" }),
    ).toHaveCount(0);
    await secondSelect.click();

    await page.keyboard.press("j");
    await expect(page.locator(".thread-row.active")).not.toHaveClass(/unread/);
    await expect(page.locator(".thread-row.active .unread-dot")).toHaveCount(0);
    const markUnreadButton = page
      .locator(".reading-toolbar")
      .getByRole("button", { name: "Mark unread" });
    await expect(markUnreadButton).toHaveAttribute("aria-keyshortcuts", "U");
    await page.keyboard.press("u");
    await expect(page.locator(".thread-row.active")).toHaveClass(/unread/);
    await page.keyboard.press("u");
    await expect(page.locator(".thread-row.active")).not.toHaveClass(/unread/);
    await expect(page.locator(".reading-toolbar")).toHaveCSS("-webkit-app-region", "drag");
    await expect(
      page.locator(".reading-toolbar").getByRole("button", { name: "Archive" }),
    ).toHaveCSS("-webkit-app-region", "no-drag");
    await expect(page.locator(".conversation-title h1")).toHaveText("Welcome to Fluxmail");
    await expect(page.locator(".conversation-scroll")).toHaveCSS("padding-top", "14px");
    await expect(page.locator(".conversation-title")).toHaveCSS("margin-bottom", "12px");
    await page.locator(".conversation-title").hover();
    await expect(page.locator(".thread-row.active .row-actions")).toHaveCSS("opacity", "0");
    await expect(page.locator(".thread-row.active .row-actions")).toHaveCSS(
      "pointer-events",
      "none",
    );
    await expect(page.locator(".message-from strong")).toHaveText("Fluxmail Team");
    await expect(page.locator(".message-from-email")).toHaveText("<team@fluxmail.test>");
    await expect(page.locator(".sender-avatar")).toHaveCSS("border-radius", "50%");
    const senderFontSize = await page
      .locator(".message-from strong")
      .evaluate((node) => getComputedStyle(node).fontSize);
    await expect(page.locator(".message-sender small")).toHaveCSS("font-size", senderFontSize);
    await expect(page.locator(".message-header time")).toHaveCSS("font-size", senderFontSize);
    const readingInsets = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>(".reading-pane")!.getBoundingClientRect();
      const toolbarFirst = document
        .querySelector<HTMLElement>(".reading-toolbar .icon-button")!
        .getBoundingClientRect();
      const toolbarLast = document
        .querySelector<HTMLElement>(".reading-toolbar > .tooltip-control:last-child .icon-button")!
        .getBoundingClientRect();
      const title = document
        .querySelector<HTMLElement>(".conversation-title")!
        .getBoundingClientRect();
      const message = document.querySelector<HTMLElement>(".message-card")!.getBoundingClientRect();
      return {
        toolbarLeft: toolbarFirst.left - pane.left,
        toolbarRight: pane.right - toolbarLast.right,
        titleLeft: title.left - pane.left,
        messageLeft: message.left - pane.left,
        messageRight: pane.right - message.right,
      };
    });
    expect(readingInsets).toEqual({
      toolbarLeft: 11,
      toolbarRight: 11,
      titleLeft: 11,
      messageLeft: 0,
      messageRight: 0,
    });
    await expect(page.locator(".conversation-title > span")).toHaveCount(0);
    const messageFrame = page.frameLocator('iframe[title="Email message"]');
    await expect(messageFrame.locator("script")).toHaveCount(0);
    await expect(messageFrame.locator("img")).toHaveCount(1);
    const loadImagesButton = page.getByRole("button", {
      name: "Load remote images",
    });
    const imageBannerLayout = await page.evaluate(() => {
      const header = document
        .querySelector<HTMLElement>(".message-header")!
        .getBoundingClientRect();
      const message = document.querySelector<HTMLElement>(".message-card")!.getBoundingClientRect();
      const banner = document.querySelector<HTMLElement>(".load-images")!.getBoundingClientRect();
      return {
        startsBelowHeader: banner.top - header.bottom,
        leftInset: banner.left - message.left,
        rightInset: message.right - banner.right,
      };
    });
    expect(imageBannerLayout).toEqual({
      startsBelowHeader: 0,
      leftInset: 0,
      rightInset: 0,
    });
    await expect(loadImagesButton).toHaveCSS("border-top-width", "0px");
    await expect(loadImagesButton).toHaveCSS("border-bottom-width", "0px");
    await loadImagesButton.click();
    await expect(page.getByRole("button", { name: "Load remote images" })).toHaveCount(0);
    await expect(messageFrame.locator('img[src="https://images.invalid/welcome.png"]')).toHaveCount(
      1,
    );
    await messageFrame.locator("#email-root").evaluate((root) => {
      root.innerHTML = '<div style="height: 4200px">Long message</div>';
    });
    await expect(page.locator('iframe[title="Email message"]')).toHaveCSS("height", "4200px");
    const conversationScrollBox = await page
      .locator(".conversation-scroll")
      .evaluate((element) => ({
        clientWidth: element.clientWidth,
        offsetWidth: (element as HTMLElement).offsetWidth,
      }));
    expect(conversationScrollBox.clientWidth).toBe(conversationScrollBox.offsetWidth);
    await page.locator(".conversation-scroll-shell").hover();
    await expect(page.locator(".conversation-scroll-shell .overlay-scrollbar")).toHaveCSS(
      "opacity",
      "1",
    );
    expect(
      await page.locator(".conversation-scroll").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        return element.scrollTop;
      }),
    ).toBeGreaterThan(0);
    await messageFrame.locator("#email-root").evaluate((root) => {
      root.innerHTML = "<p>Welcome to Fluxmail</p>";
    });

    await page.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(
      page.locator(".quick-reply").getByRole("button", { name: "Underline" }),
    ).toBeVisible();
    await expect(
      page.locator(".quick-reply").getByRole("button", { name: "Underline" }),
    ).toHaveAttribute("aria-keyshortcuts", "Meta+U");
    await expect(
      page.locator(".quick-reply").getByRole("button", { name: "Show quoted message" }),
    ).toBeVisible();
    await page.locator(".quick-reply").getByRole("button", { name: "Show quoted message" }).click();
    await expect(page.locator(".quick-reply .quoted-reply-content")).toBeVisible();
    await page.locator(".quick-reply").getByRole("button", { name: "Cancel" }).click();

    await page.locator(".reading-toolbar").getByRole("button", { name: "Archive" }).click();
    await expect(page.locator(".thread-row.active")).toHaveCount(0, {
      timeout: 200,
    });
    await expect(page.locator(".reading-placeholder")).toBeVisible({
      timeout: 200,
    });
    await expect(page.getByText("Welcome to Fluxmail", { exact: true })).toHaveCount(0);

    const search = page.getByRole("textbox", { name: "Search mail" });
    await search.fill("receipt");
    await search.press("Enter");
    await expect(page.getByText("Receipt for Tuesday", { exact: true })).toBeVisible();
    await page.getByText("Receipt for Tuesday", { exact: true }).click();
    await page.locator(".reading-toolbar").getByRole("button", { name: "Trash" }).click();
    await expect(page.getByText("Receipt for Tuesday", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Trash", exact: true }).click();
    await page.getByText("Receipt for Tuesday", { exact: true }).click();
    const trashToolbar = page.locator(".reading-toolbar");
    await expect(trashToolbar.getByRole("button", { name: "Restore" })).toBeVisible();
    await expect(trashToolbar.getByRole("button", { name: "Delete permanently" })).toBeVisible();
    await trashToolbar.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Receipt for Tuesday", { exact: true })).toHaveCount(0);

    await draftsNav.click();
    const launchDraft = page.locator(".thread-row").filter({ hasText: "Launch notes" });
    await expect(launchDraft).toBeVisible();
    await launchDraft.click();
    const resumedDraft = page.getByRole("dialog", { name: "New message" });
    await expect(resumedDraft.locator("header strong")).toHaveText("Launch notes");
    await expect(resumedDraft.locator(".recipient-summary")).toContainText("sam@example.test");
    await expect(resumedDraft.locator('[contenteditable="true"]')).toContainText(
      "The first draft is ready.",
    );
    await expect(resumedDraft.locator(".compose-attachments")).toContainText("launch-notes.pdf");
    await expect(resumedDraft.getByText("Draft saved", { exact: true })).toBeVisible();
    await resumedDraft.getByRole("button", { name: "Close compose" }).click();
    await expect(resumedDraft).toBeHidden();

    await page.keyboard.press("Meta+c");
    await expect(page.getByRole("dialog", { name: "New message" })).toHaveCount(0);
    await page.getByRole("button", { name: "Compose" }).click();
    const compose = page.getByRole("dialog", { name: "New message" });
    await expect(page.locator(".modal-backdrop")).toHaveCSS("backdrop-filter", "none");
    await expect(compose.locator("header")).toHaveCSS("border-bottom-width", "0px");
    expect(
      await compose.evaluate((dialog) => {
        const header = dialog.querySelector("header")!;
        return (
          getComputedStyle(header).backgroundColor === getComputedStyle(dialog).backgroundColor
        );
      }),
    ).toBe(true);
    await expect(compose.getByRole("button", { name: "Cc", exact: true })).toBeVisible();
    await expect(compose.getByRole("button", { name: "Bcc", exact: true })).toBeVisible();
    await expect(compose.locator(".recipient-row").filter({ hasText: /^Cc/ })).toHaveCount(0);
    await compose
      .locator(".recipient-row")
      .filter({ hasText: /^To/ })
      .locator("input")
      .fill("friend@example.com");
    await compose.getByRole("button", { name: "Cc", exact: true }).click();
    await compose
      .locator(".recipient-row")
      .filter({ hasText: /^Cc/ })
      .locator("input")
      .fill("copy@example.com");
    await compose
      .locator("label")
      .filter({ hasText: /^Subject/ })
      .locator("input")
      .fill("Desktop test");
    await expect(compose.locator("header strong")).toHaveText("Desktop test");
    await expect(compose.locator(".recipient-summary")).toContainText("friend@example.com");
    await expect(compose.locator(".recipient-summary")).toContainText("copy@example.com");
    await expect(compose.getByRole("button", { name: "Bulleted list" })).toBeVisible();
    await expect(compose.getByRole("button", { name: "Undo" })).toBeVisible();
    await compose.locator('[contenteditable="true"]').fill("Sent from the desktop client.");
    const editorBounds = await compose.locator(".compose-editor").boundingBox();
    if (!editorBounds) throw new Error("Compose editor did not render.");
    await compose.locator(".compose-editor").click({
      position: { x: editorBounds.width / 2, y: editorBounds.height - 8 },
    });
    await expect(compose.locator('[contenteditable="true"]')).toBeFocused();
    await expect(compose.getByRole("button", { name: /^Send/ })).toHaveCSS(
      "border-top-width",
      "0px",
    );
    await page.keyboard.press("Meta+Enter");
    await expect(compose).toBeHidden();

    const settingsButton = page.getByRole("button", { name: "Settings" });
    await settingsButton.hover();
    await expect(settingsButton).toHaveCSS("border-top-width", "0px");
    await settingsButton.click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    const systemTheme = settings.getByRole("radio", { name: "System" });
    const lightTheme = settings.getByRole("radio", { name: "Light" });
    const darkTheme = settings.getByRole("radio", { name: "Dark" });
    await expect(systemTheme).toHaveAttribute("aria-checked", "true");
    await darkTheme.click();
    await expect(darkTheme).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("dark");
    await lightTheme.click();
    await expect(lightTheme).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("light");
    await systemTheme.click();
    expect(await settings.locator(".settings-content > section > h2").allTextContents()).toEqual([
      "Plan",
      "Accounts",
      "Appearance",
      "Privacy",
    ]);
    const dockBadgeCheckbox = settings.getByRole("checkbox", {
      name: "Dock badge",
    });
    await expect(dockBadgeCheckbox).toHaveAttribute("aria-checked", "true");
    await electronApp.evaluate(({ app }) => app.dock?.setBadge("7"));
    await dockBadgeCheckbox.click();
    await expect(dockBadgeCheckbox).toHaveAttribute("aria-checked", "false");
    await expect.poll(() => electronApp.evaluate(({ app }) => app.dock?.getBadge())).toBe("");
    await dockBadgeCheckbox.click();
    await expect(dockBadgeCheckbox).toHaveAttribute("aria-checked", "true");
    await expect(settings.getByRole("heading", { name: "Privacy" })).toBeVisible();
    await expect(
      settings.getByText(
        "Send anonymized analytics to help us improve our features, performance, and reliability. Your email content is never included.",
      ),
    ).toBeVisible();
    const analyticsCheckbox = settings.getByRole("checkbox", {
      name: "Anonymous analytics",
    });
    const initialAnalyticsState = await analyticsCheckbox.getAttribute("aria-checked");
    await expect(analyticsCheckbox.locator(".selection-indicator")).toBeVisible();
    await analyticsCheckbox.click();
    await expect(analyticsCheckbox).toHaveAttribute(
      "aria-checked",
      initialAnalyticsState === "true" ? "false" : "true",
    );
    await expect(settings.getByText("Personal", { exact: true })).toBeVisible();
    await expect(
      settings.getByText("Includes up to 3 connected mailboxes for one member."),
    ).toBeVisible();
    await expect(settings.getByRole("button", { name: "View plans" })).toBeVisible();
    await expect(settings.locator("header")).toHaveCSS("border-bottom-width", "0px");
    expect(
      await settings.evaluate((dialog) => {
        const header = dialog.querySelector("header")!;
        return (
          getComputedStyle(header).backgroundColor === getComputedStyle(dialog).backgroundColor
        );
      }),
    ).toBe(true);
    const accountActionAlignment = await settings
      .locator(".settings-accounts > div")
      .evaluate((row) => {
        const identity = row.querySelector(".account-identity")!.getBoundingClientRect();
        const actions = row.querySelector(".account-actions")!.getBoundingClientRect();
        return {
          identityRight: identity.right,
          actionsLeft: actions.left,
          actionsRight: actions.right,
          rowRight: row.getBoundingClientRect().right,
        };
      });
    expect(accountActionAlignment.actionsLeft).toBeGreaterThanOrEqual(
      accountActionAlignment.identityRight,
    );
    expect(accountActionAlignment.rowRight - accountActionAlignment.actionsRight).toBeLessThan(14);
  } finally {
    await electronApp.close();
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test("archives when the email iframe has focus", async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), "fluxmail-iframe-shortcut-e2e-"));
  const electronApp = await electron.launch({
    args: [process.cwd()],
    env: {
      ...process.env,
      FLUXMAIL_DESKTOP_FAKE_MAIL: "1",
      FLUXMAIL_DESKTOP_E2E_HEADLESS: "1",
      FLUXMAIL_DESKTOP_TEST_DATA_DIR: dataDirectory,
      FLUXMAIL_DATA_DIR: path.join(dataDirectory, ".fluxmail"),
      FLUXMAIL_TELEMETRY: "0",
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    const welcomeThread = page.locator(".thread-row").filter({ hasText: "Welcome to Fluxmail" });
    await welcomeThread.click();

    const messageFrame = page.frameLocator('iframe[title="Email message"]');
    await messageFrame.locator("#email-root").click();
    await page.keyboard.press("e");

    await expect(page.locator(".reading-placeholder")).toBeVisible();
    await expect(welcomeThread).toHaveCount(0);
  } finally {
    await electronApp.close();
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test("saves a draft before closing the window", async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), "fluxmail-window-close-e2e-"));
  const electronApp = await electron.launch({
    args: [process.cwd()],
    env: {
      ...process.env,
      FLUXMAIL_DESKTOP_FAKE_MAIL: "1",
      FLUXMAIL_DESKTOP_E2E_HEADLESS: "1",
      FLUXMAIL_DESKTOP_TEST_DATA_DIR: dataDirectory,
      FLUXMAIL_DATA_DIR: path.join(dataDirectory, ".fluxmail"),
      FLUXMAIL_TELEMETRY: "0",
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await page.getByRole("button", { name: "Compose" }).click();
    const compose = page.getByRole("dialog", { name: "New message" });
    await compose
      .locator("label")
      .filter({ hasText: /^Subject/ })
      .locator("input")
      .fill("Saved during window close");

    const nextWindow = electronApp.waitForEvent("window");
    const windowClosed = page.waitForEvent("close");
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await windowClosed;
    await electronApp.evaluate(({ app }) => app.emit("activate"));
    const reopened = await nextWindow;
    await expect(reopened.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await reopened.getByRole("button", { name: "Drafts" }).click();
    await expect(reopened.getByText("Saved during window close", { exact: true })).toBeVisible();
  } finally {
    await electronApp.close();
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test("starts the packaged app with the bundled Fluxmail service", async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), "fluxmail-packaged-smoke-"));
  const executable = path.join(
    process.cwd(),
    `out/Fluxmail-darwin-${process.arch}`,
    "Fluxmail.app/Contents/MacOS/Fluxmail",
  );
  const child = spawn(executable, [`--user-data-dir=${path.join(dataDirectory, "user-data")}`], {
    env: {
      ...process.env,
      FLUXMAIL_DESKTOP_E2E_HEADLESS: "1",
      FLUXMAIL_DATA_DIR: path.join(dataDirectory, ".fluxmail"),
      FLUXMAIL_TELEMETRY: "0",
    },
    stdio: "pipe",
  });

  try {
    const status = await Promise.race([
      new Promise<string>((resolve) =>
        child.once("exit", (code, signal) => resolve(`exit:${code}:${signal}`)),
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("running"), 3_000)),
    ]);
    expect(status).toBe("running");
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise<void>((resolve) => child.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    rmSync(dataDirectory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
