import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'.',testMatch:'*.spec.ts',timeout:90000,workers:1,fullyParallel:false,
 use:{contextOptions:{reducedMotion:'reduce'},baseURL:'http://127.0.0.1:5187',timezoneId:'UTC',screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5187 --strictPort',url:'http://127.0.0.1:5187',reuseExistingServer:false,cwd:'../..'},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{viewport:{width:390,height:844}}}],
 reporter:[['list']],preserveOutput:'always',outputDir:'../../test-results/live-browser',
});
