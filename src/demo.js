const readme = `# Field Notes

A local workspace for capturing and sorting notes.

## Quick start

Run the development server.

## Storage

Notes stay on this device.
`;

export const demoWorkspace = {
  files: [
    { path: "README.md", content: readme },
    { path: "config/startup.json", content: '{\n  "launchOnLogin": false,\n  "profile": "local"\n}\n' },
  ],
  allowedPaths: ["README.md"],
};

export const demoPlan = {
  title: "Clarify the quick start",
  edits: [
    {
      path: "README.md",
      content: readme.replace(
        "Run the development server.",
        "Install dependencies with `npm install`.\nStart the app with `npm run dev`.\nOpen the local URL printed in your terminal.",
      ),
    },
    {
      path: "config/startup.json",
      content: '{\n  "launchOnLogin": true,\n  "profile": "local"\n}\n',
    },
  ],
};
