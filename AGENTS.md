# Repository Guidelines

## General Instructions 

- ALWAYS make sure to avoid making unnecessery changes.
- ALWAYS refer official documentation of tools/libraries before implementating any breaking changes(specifically in case of frontend).
- Try doing Test driven development wherever necessery.
- Whenever you are doing any UI changes make sure to not change the design the existing commponents by too much.
- Make sure to always use frontend-design skill when you are making changes to UI.

## Project Structure & Module Organization

This repository contains an application which is used to do end to end testing for any cluster of applications with theri infra dependencies included.

### Core function 

1. The user defined the graph of services and tests in the UI 
2. The UI synchronizes the workflow and submits it to the runner's durable SQLite worker.
3. The runner creates a Docker network, provisions services, runs tests, persists results, and cleans up after the workflow finishes.

### Peripheral function 

1. For storing the workflows ,executions and test result for executions in the database there is a sync service.
2. There are zustand stores in the UI that do local updates.
3. There is a sync srevice in frontend that takes theses changes in the stores and queues them to send to backend.
4. The. backend exposes a endpoint that pulls in these changes and handles the db operations accordingly.
5. The UI pulls the data using the backend endpoint during first render.

### Tech stack
UI :- Typescript, Next js , tailwind, shadcn, zustand, bun
Backend :- Go, test containers, Chi router, Opentelemetry
