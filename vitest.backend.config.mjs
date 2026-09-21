export default {
  test: {
    environment: "node",
    include: ["packages/**/src/**/*.test.ts", "runtime-sidecar/src/**/*.test.ts"]
  }
};
