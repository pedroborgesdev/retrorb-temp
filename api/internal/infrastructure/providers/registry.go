package providers

import "retromancy/api/internal/ports"

// Registry maintains registered providers in deterministic display order.
type Registry struct {
	order []string
	items map[string]ports.Provider
}

// NewRegistry creates an ordered Registry from the provided provider slice.
func NewRegistry(list ...ports.Provider) *Registry {
	order := make([]string, 0, len(list))
	items := make(map[string]ports.Provider, len(list))
	for _, p := range list {
		if p == nil {
			continue
		}
		id := p.ID()
		if _, exists := items[id]; !exists {
			order = append(order, id)
		}
		items[id] = p
	}
	return &Registry{
		order: order,
		items: items,
	}
}

// Get returns the provider for id, if registered.
func (r *Registry) Get(id string) (ports.Provider, bool) {
	p, ok := r.items[id]
	return p, ok
}

// Keys returns provider identifiers in registration order.
func (r *Registry) Keys() []string {
	out := make([]string, len(r.order))
	copy(out, r.order)
	return out
}

// All returns all providers in registration order.
func (r *Registry) All() []ports.Provider {
	out := make([]ports.Provider, 0, len(r.order))
	for _, id := range r.order {
		out = append(out, r.items[id])
	}
	return out
}
