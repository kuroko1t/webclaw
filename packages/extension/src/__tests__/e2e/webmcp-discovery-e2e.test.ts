/**
 * E2E tests for WebMCP tool discovery and auto-synthesis.
 *
 * Covers:
 * - listWebMCPTools content script handler (synthesized tools)
 * - Form auto-synthesis (schema, required fields, field labels)
 * - Standalone button synthesis (excluding form buttons)
 * - invokeWebMCPTool timeout when no WebMCP support
 * - Tool naming and sanitization
 * - Edge cases: form with no inputs, only hidden inputs, multiple forms
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'puppeteer-core';
import type { Server } from 'http';
import {
  launchBrowserWithExtension,
  openPageAndWaitForContentScript,
  sendToContentScript,
  startTestServer,
} from './helpers';

let browser: Browser;
let page: Page;
let server: Server;
let port: number;

const pages: Record<string, string> = {
  '/simple-form': `<!DOCTYPE html><html><head><title>Simple Form</title></head><body>
    <h1>Contact Us</h1>
    <form id="contact-form" aria-label="Contact Form">
      <label for="name">Full Name</label>
      <input id="name" name="name" type="text" required>
      <label for="email">Email Address</label>
      <input id="email" name="email" type="email" required>
      <label for="message">Message</label>
      <textarea id="message" name="message" placeholder="Your message"></textarea>
      <button type="submit">Send Message</button>
    </form>
    <button id="standalone-btn">Help</button>
  </body></html>`,

  '/multi-form': `<!DOCTYPE html><html><head><title>Multi Form</title></head><body>
    <h1>Dashboard</h1>
    <h2>Search</h2>
    <form id="search-form">
      <input name="q" type="search" aria-label="Search query">
      <button type="submit">Search</button>
    </form>
    <h2>Settings</h2>
    <form id="settings-form" aria-label="User Settings">
      <label for="theme">Theme</label>
      <select id="theme" name="theme">
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="auto">Auto</option>
      </select>
      <label for="lang">Language</label>
      <select id="lang" name="lang">
        <option value="en">English</option>
        <option value="ja">Japanese</option>
      </select>
      <label for="notifications">Notifications</label>
      <input id="notifications" name="notifications" type="checkbox">
      <button type="submit">Save Settings</button>
    </form>
    <!-- Standalone buttons -->
    <button id="logout-btn">Logout</button>
    <button id="refresh-btn" aria-label="Refresh Data">&#x21BB;</button>
  </body></html>`,

  '/no-form': `<!DOCTYPE html><html><head><title>No Form</title></head><body>
    <h1>Static Page</h1>
    <p>This page has no forms.</p>
    <button id="btn1">Click Me</button>
    <div role="button" id="btn2" aria-label="Custom Action">Do Something</div>
    <a href="#" role="button" id="btn3">Link Button</a>
  </body></html>`,

  '/empty-forms': `<!DOCTYPE html><html><head><title>Empty Forms</title></head><body>
    <h1>Edge Cases</h1>
    <!-- Form with no inputs -->
    <form id="empty-form" aria-label="Empty Form">
      <p>Just text, no inputs.</p>
      <button type="submit">Submit</button>
    </form>
    <!-- Form with only hidden inputs -->
    <form id="hidden-only" aria-label="Hidden Only">
      <input type="hidden" name="csrf" value="abc123">
      <input type="hidden" name="session" value="xyz789">
      <button type="submit">Go</button>
    </form>
    <!-- Form with only submit input -->
    <form id="submit-only" aria-label="Submit Only">
      <input type="submit" value="Submit">
    </form>
    <!-- Valid form -->
    <form id="valid-form" aria-label="Valid Form">
      <input name="data" type="text" placeholder="Enter data">
      <button type="submit">Save</button>
    </form>
  </body></html>`,

  '/form-field-types': `<!DOCTYPE html><html><head><title>Field Types</title></head><body>
    <h1>Registration</h1>
    <form id="reg-form" aria-label="Registration">
      <label for="username">Username</label>
      <input id="username" name="username" type="text" required>
      <label for="age">Age</label>
      <input id="age" name="age" type="number">
      <label for="website">Website</label>
      <input id="website" name="website" type="url">
      <label for="phone">Phone</label>
      <input id="phone" name="phone" type="tel">
      <label for="birthday">Birthday</label>
      <input id="birthday" name="birthday" type="date">
      <label for="score">Score</label>
      <input id="score" name="score" type="range" min="0" max="100">
      <label for="agree">I agree</label>
      <input id="agree" name="agree" type="checkbox" required>
      <label for="bio">Bio</label>
      <textarea id="bio" name="bio"></textarea>
      <button type="submit">Register</button>
    </form>
  </body></html>`,

  '/form-naming': `<!DOCTYPE html><html><head><title>Form Naming</title></head><body>
    <!-- Form with aria-label -->
    <form id="f1" aria-label="Login Form">
      <input name="user" type="text">
      <button type="submit">Login</button>
    </form>
    <!-- Form with title -->
    <form id="f2" title="Feedback Form">
      <input name="comment" type="text">
      <button type="submit">Send</button>
    </form>
    <!-- Form named by preceding heading -->
    <h3>Newsletter Signup</h3>
    <form id="f3">
      <input name="email" type="email">
      <button type="submit">Subscribe</button>
    </form>
    <!-- Form named by submit button text (no heading, no aria-label, no title) -->
    <div>
      <form id="f4">
        <input name="data" type="text">
        <button type="submit">Process Payment</button>
      </form>
    </div>
    <!-- Form named by action path (no submit button text to fall through) -->
    <div>
      <form id="f5" action="/api/upload">
        <input name="file" type="text">
      </form>
    </div>
  </body></html>`,

  '/button-edge-cases': `<!DOCTYPE html><html><head><title>Button Edge Cases</title></head><body>
    <h1>Buttons</h1>
    <!-- Button inside form (should NOT be synthesized as standalone) -->
    <form>
      <input name="x" type="text">
      <button type="submit">Form Button</button>
    </form>
    <!-- Standalone buttons -->
    <button>Short Text</button>
    <button aria-label="Icon Button">&#x2764;</button>
    <button title="Title Button"></button>
    <!-- Button with very long text (>50 chars, should be skipped by getButtonName) -->
    <button>This is a button with a very long text that exceeds fifty characters limit</button>
    <!-- role="button" inside form (should NOT be standalone) -->
    <form>
      <input name="y" type="text">
      <div role="button">Custom Form Button</div>
    </form>
  </body></html>`,
};

beforeAll(async () => {
  const srv = await startTestServer(pages);
  server = srv.server;
  port = srv.port;
  browser = await launchBrowserWithExtension();
  page = (await browser.pages())[0] ?? (await browser.newPage());
}, 30_000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

describe('WebMCP Discovery & Auto-Synthesis E2E', () => {
  // --- Basic Form Synthesis ---

  it('should discover synthesized form tool from simple form', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/simple-form`);
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });

    expect(result.tools).toBeDefined();
    expect(Array.isArray(result.tools)).toBe(true);

    // Should have at least 1 form tool and 1 button tool
    const formTools = result.tools.filter((t: any) => t.source === 'synthesized-form');
    const buttonTools = result.tools.filter((t: any) => t.source === 'synthesized-button');

    expect(formTools.length).toBeGreaterThanOrEqual(1);
    expect(buttonTools.length).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it('should generate correct schema for form fields', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/simple-form`);
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });

    const contactTool = result.tools.find((t: any) =>
      t.name.includes('contact_form'),
    );
    expect(contactTool).toBeTruthy();
    expect(contactTool.description).toContain('Contact Form');

    // Check field schema
    const props = contactTool.inputSchema.properties;
    expect(props.name).toBeDefined();
    expect(props.name.type).toBe('string');
    expect(props.email).toBeDefined();
    expect(props.email.type).toBe('string');
    expect(props.message).toBeDefined();
    expect(props.message.type).toBe('string');

    // Check required fields
    expect(contactTool.inputSchema.required).toContain('name');
    expect(contactTool.inputSchema.required).toContain('email');
    expect(contactTool.inputSchema.required).not.toContain('message');
  }, 15_000);

  it('should include standalone button but not form button', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/simple-form`);
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });

    const buttonTools = result.tools.filter((t: any) => t.source === 'synthesized-button');
    const buttonNames = buttonTools.map((t: any) => t.name);

    // Standalone "Help" button should be synthesized
    expect(buttonNames.some((n: string) => n.includes('help'))).toBe(true);

    // "Send Message" is inside <form> so should NOT be standalone
    expect(buttonNames.some((n: string) => n.includes('send_message'))).toBe(false);
  }, 15_000);

  // --- Multiple Forms ---

  it('should discover tools from multiple forms on same page', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-form`);
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });

    const formTools = result.tools.filter((t: any) => t.source === 'synthesized-form');
    expect(formTools.length).toBe(2);

    // Search form (named by heading "Search")
    const searchTool = formTools.find((t: any) => t.name.includes('search'));
    expect(searchTool).toBeTruthy();

    // Settings form (named by aria-label)
    const settingsTool = formTools.find((t: any) => t.name.includes('user_settings'));
    expect(settingsTool).toBeTruthy();
  }, 15_000);

  it('should generate enum for select fields', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-form`);
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });

    const settingsTool = result.tools.find((t: any) => t.name.includes('user_settings'));
    expect(settingsTool).toBeTruthy();

    const props = settingsTool.inputSchema.properties;

    // Theme select should have enum
    expect(props.theme.type).toBe('string');
    expect(props.theme.enum).toEqual(['light', 'dark', 'auto']);

    // Language select
    expect(props.lang.enum).toEqual(['en', 'ja']);

    // Checkbox
    expect(props.notifications.type).toBe('boolean');
  }, 15_000);

  it('should discover standalone buttons but not form buttons', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-form`);
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });

    const buttonTools = result.tools.filter((t: any) => t.source === 'synthesized-button');
    const buttonNames = buttonTools.map((t: any) => t.name);

    // Standalone buttons
    expect(buttonNames.some((n: string) => n.includes('logout'))).toBe(true);
    expect(buttonNames.some((n: string) => n.includes('refresh_data'))).toBe(true);

    // Form buttons should NOT be standalone
    expect(buttonNames.some((n: string) => n.includes('search'))).toBe(false);
    expect(buttonNames.some((n: string) => n.includes('save_settings'))).toBe(false);
  }, 15_000);

  // --- No Form Page ---

  it('should discover only button tools on page without forms', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/no-form`);
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });

    const formTools = result.tools.filter((t: any) => t.source === 'synthesized-form');
    expect(formTools.length).toBe(0);

    const buttonTools = result.tools.filter((t: any) => t.source === 'synthesized-button');
    expect(buttonTools.length).toBeGreaterThanOrEqual(2);

    const names = buttonTools.map((t: any) => t.name);
    expect(names.some((n: string) => n.includes('click_me'))).toBe(true);
    expect(names.some((n: string) => n.includes('custom_action'))).toBe(true);
  }, 15_000);

  // --- Empty/Hidden-Only Forms ---

  it('should skip forms with no visible inputs', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/empty-forms`);
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });

    const formTools = result.tools.filter((t: any) => t.source === 'synthesized-form');

    // Only "Valid Form" should produce a synthesized tool
    // empty-form: no inputs, hidden-only: only hidden/submit inputs, submit-only: only submit input
    expect(formTools.length).toBe(1);
    expect(formTools[0].name).toContain('valid_form');
  }, 15_000);

  // --- Field Type Schema ---

  it('should generate correct schema types for different input types', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/form-field-types`);
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });

    const regTool = result.tools.find((t: any) => t.name.includes('registration'));
    expect(regTool).toBeTruthy();

    const props = regTool.inputSchema.properties;

    // text → string
    expect(props.username.type).toBe('string');
    // number → number
    expect(props.age.type).toBe('number');
    // url → string (label overwrites type hint)
    expect(props.website.type).toBe('string');
    expect(props.website.description).toBe('Website');
    // tel → string
    expect(props.phone.type).toBe('string');
    // date → string (label overwrites type hint)
    expect(props.birthday.type).toBe('string');
    expect(props.birthday.description).toBe('Birthday');
    // range → number
    expect(props.score.type).toBe('number');
    // checkbox → boolean
    expect(props.agree.type).toBe('boolean');
    // textarea → string
    expect(props.bio.type).toBe('string');

    // Required fields
    expect(regTool.inputSchema.required).toContain('username');
    expect(regTool.inputSchema.required).toContain('agree');
    expect(regTool.inputSchema.required).not.toContain('age');
  }, 15_000);

  // --- Form Naming Strategies ---

  it('should name forms by aria-label, title, heading, submit text, or action', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/form-naming`);
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });

    const formTools = result.tools.filter((t: any) => t.source === 'synthesized-form');
    const names = formTools.map((t: any) => t.name);

    // aria-label: "Login Form"
    expect(names.some((n: string) => n.includes('login_form'))).toBe(true);
    // title: "Feedback Form"
    expect(names.some((n: string) => n.includes('feedback_form'))).toBe(true);
    // heading: "Newsletter Signup"
    expect(names.some((n: string) => n.includes('newsletter_signup'))).toBe(true);
    // submit text: "Process Payment"
    expect(names.some((n: string) => n.includes('process_payment'))).toBe(true);
    // action path: "/api/upload" → "upload"
    expect(names.some((n: string) => n.includes('upload'))).toBe(true);
  }, 15_000);

  // --- Button Edge Cases ---

  it('should exclude form buttons and long-text buttons from synthesis', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/button-edge-cases`);
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });

    const buttonTools = result.tools.filter((t: any) => t.source === 'synthesized-button');
    const names = buttonTools.map((t: any) => t.name);

    // Standalone buttons with short text
    expect(names.some((n: string) => n.includes('short_text'))).toBe(true);
    // Button with aria-label
    expect(names.some((n: string) => n.includes('icon_button'))).toBe(true);
    // Button with title
    expect(names.some((n: string) => n.includes('title_button'))).toBe(true);

    // Form buttons should NOT be standalone
    expect(names.some((n: string) => n.includes('form_button'))).toBe(false);
    // Custom form button (role="button" inside form)
    expect(names.some((n: string) => n.includes('custom_form_button'))).toBe(false);

    // Long text button (>50 chars) should be skipped
    expect(names.some((n: string) => n.includes('exceeds'))).toBe(false);
  }, 15_000);

  // --- invokeWebMCPTool Timeout ---

  it('should timeout when invoking non-existent WebMCP tool', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/simple-form`);

    // invokeWebMCPTool sends a message to page bridge, which has no WebMCP
    // The 30-second timeout in action-executor.ts should fire
    // We use a shorter test timeout and verify the promise resolves with error
    const result = await sendToContentScript(browser, page, {
      action: 'invokeWebMCPTool',
      toolName: 'nonexistent_tool',
      args: {},
    });

    // Should return error (timeout or tool not found)
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  }, 35_000);

  // --- Tool Discovery on Page Without Forms or Buttons ---

  it('should return tools array even on minimal page', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/empty-forms`);
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });

    expect(result.tools).toBeDefined();
    expect(Array.isArray(result.tools)).toBe(true);
    // Should have at least some tools (buttons from empty-forms page)
  }, 15_000);

  // --- Integration: listWebMCPTools + Snapshot ---

  it('should discover tools and take snapshot on same page', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/simple-form`);

    // First take snapshot
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('"Contact Us"');

    // Then discover tools
    const result = await sendToContentScript(browser, page, { action: 'listWebMCPTools' });
    expect(result.tools.length).toBeGreaterThan(0);

    // Snapshot refs should still work after tool discovery
    const inputRef = snap.text.match(/@e\d+(?= textbox)/)?.[0];
    expect(inputRef).toBeTruthy();
    const typeResult = await sendToContentScript(browser, page, {
      action: 'typeText', ref: inputRef, text: 'test',
    });
    expect(typeResult.success).toBe(true);
  }, 15_000);
});
