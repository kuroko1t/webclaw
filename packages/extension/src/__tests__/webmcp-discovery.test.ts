/**
 * Tests for the auto-synthesis part of WebMCP discovery.
 * Native WebMCP discovery requires navigator.modelContext which is not available in jsdom,
 * so we focus on testing the form/button/input synthesis logic.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { discoverWebMCPTools } from '../content/webmcp-discovery';

describe('webmcp-discovery auto-synthesis', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('synthesizes a tool from a form with inputs', async () => {
    document.body.innerHTML = `
      <form aria-label="Login">
        <input name="username" type="text" placeholder="Username" required>
        <input name="password" type="password" required>
        <button type="submit">Log in</button>
      </form>
    `;

    const tools = await discoverWebMCPTools(1);
    const formTool = tools.find((t) => t.source === 'synthesized-form');
    expect(formTool).toBeDefined();
    expect(formTool!.name).toContain('login');
    expect(formTool!.inputSchema.properties).toHaveProperty('username');
    expect(formTool!.inputSchema.properties).toHaveProperty('password');
    expect(formTool!.inputSchema.required).toContain('username');
    expect(formTool!.inputSchema.required).toContain('password');
  });

  it('synthesizes tools from standalone buttons', async () => {
    document.body.innerHTML = `
      <button>Save</button>
      <button>Cancel</button>
    `;

    const tools = await discoverWebMCPTools(1);
    const buttonTools = tools.filter((t) => t.source === 'synthesized-button');
    expect(buttonTools.length).toBe(2);
    expect(buttonTools[0].name).toContain('save');
    expect(buttonTools[1].name).toContain('cancel');
  });

  it('does not synthesize buttons inside forms as standalone', async () => {
    document.body.innerHTML = `
      <form aria-label="Search">
        <input name="q" type="text">
        <button type="submit">Search</button>
      </form>
    `;

    const tools = await discoverWebMCPTools(1);
    const buttonTools = tools.filter((t) => t.source === 'synthesized-button');
    expect(buttonTools.length).toBe(0);
  });

  it('skips forms with no inputs', async () => {
    document.body.innerHTML = '<form aria-label="Empty"></form>';

    const tools = await discoverWebMCPTools(1);
    const formTools = tools.filter((t) => t.source === 'synthesized-form');
    expect(formTools.length).toBe(0);
  });

  it('skips hidden inputs', async () => {
    document.body.innerHTML = `
      <form aria-label="Test">
        <input name="token" type="hidden" value="abc">
        <input name="email" type="email">
      </form>
    `;

    const tools = await discoverWebMCPTools(1);
    const formTool = tools.find((t) => t.source === 'synthesized-form');
    expect(formTool).toBeDefined();
    expect(formTool!.inputSchema.properties).not.toHaveProperty('token');
    expect(formTool!.inputSchema.properties).toHaveProperty('email');
  });

  it('infers field types from input type', async () => {
    document.body.innerHTML = `
      <form aria-label="Profile">
        <input name="age" type="number">
        <input name="agree" type="checkbox">
        <input name="email" type="email">
      </form>
    `;

    const tools = await discoverWebMCPTools(1);
    const formTool = tools.find((t) => t.source === 'synthesized-form');
    expect(formTool).toBeDefined();
    const props = formTool!.inputSchema.properties!;
    expect(props.age.type).toBe('number');
    expect(props.agree.type).toBe('boolean');
    expect(props.email.type).toBe('string');
  });

  it('synthesizes select options as enum', async () => {
    document.body.innerHTML = `
      <form aria-label="Settings">
        <select name="theme">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </form>
    `;

    const tools = await discoverWebMCPTools(1);
    const formTool = tools.find((t) => t.source === 'synthesized-form');
    expect(formTool).toBeDefined();
    const themeSchema = formTool!.inputSchema.properties!.theme;
    expect(themeSchema.enum).toEqual(['light', 'dark']);
  });

  it('sets tabId on all tools', async () => {
    document.body.innerHTML = '<button>Test</button>';
    const tools = await discoverWebMCPTools(42);
    for (const tool of tools) {
      expect(tool.tabId).toBe(42);
    }
  });
});
