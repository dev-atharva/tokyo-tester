package orchestrator

import "fmt"

// Basically a node in the graph
type Node struct {
	Name         string
	Dependencies []string
}

// Used to manage the node dependency resolution
type DependencyGraph struct {
	nodes map[string]*Node
}

func NewDependencyGraph() *DependencyGraph {
	return &DependencyGraph{
		nodes: make(map[string]*Node),
	}
}

func (g *DependencyGraph) AddNode(name string, dependencies []string) {
	g.nodes[name] = &Node{
		Name:         name,
		Dependencies: dependencies,
	}
}

// Return the nodes in teh execution order (dependencies are resolved first)
func (g *DependencyGraph) TopologicalSort() ([][]string, error) {
	//Check for cycles
	if err := g.detectCycles(); err != nil {
		return nil, err
	}

	visited := make(map[string]bool)
	levels := [][]string{}

	for len(visited) < len(g.nodes) {
		level := []string{}

		//Find all nodes whose dependencies are satisfied
		for name, node := range g.nodes {
			if visited[name] {
				continue
			}
			allDepsVisited := true
			for _, dep := range node.Dependencies {
				if !visited[dep] {
					allDepsVisited = false
					break
				}
			}

			if allDepsVisited {
				level = append(level, name)
			}
		}
		if len(level) == 0 {
			return nil, fmt.Errorf("unable to resolve dependencies")
		}

		for _, name := range level {
			visited[name] = true
		}
		levels = append(levels, level)
	}
	return levels, nil
}

func (g *DependencyGraph) detectCycles() error {
	visited := make(map[string]bool)
	recStack := make(map[string]bool)

	for name := range g.nodes {
		if !visited[name] {
			if err := g.dfsCheckCycle(name, visited, recStack, []string{name}); err != nil {
				return err
			}
		}
	}
	return nil
}

func (g *DependencyGraph) dfsCheckCycle(nodeName string, visited, recStack map[string]bool, path []string) error {
	visited[nodeName] = true
	recStack[nodeName] = true
	node, exists := g.nodes[nodeName]

	if !exists {
		return fmt.Errorf("dependency not found : %s", nodeName)
	}

	for _, dep := range node.Dependencies {
		if _, exists := g.nodes[dep]; !exists {
			return fmt.Errorf("service %s depends on non-existant service : %s", nodeName, dep)
		}
		if !visited[dep] {
			newPath := append(path, dep)
			if err := g.dfsCheckCycle(dep, visited, recStack, newPath); err != nil {
				return err
			}
		} else if recStack[dep] {
			cycle := append(path, dep)
			return fmt.Errorf("curcular dependency detected : %v", cycle)
		}
	}

	recStack[nodeName] = false
	return nil
}
