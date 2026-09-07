module github.com/kailholmes/campuslive/services/api

go 1.24

// NOTE on the replace block below: the build sandbox this repo was authored in
// cannot reach proxy.golang.org / golang.org / gopkg.in, so golang.org/x/* and
// gopkg.in/* are pinned to their official GitHub mirrors. The mirrors are
// byte-identical; on a normal network you may delete the whole block and run
// `go mod tidy`.
replace (
	go.uber.org/multierr => github.com/uber-go/multierr v1.11.0
	golang.org/x/crypto => github.com/golang/crypto v0.41.0
	golang.org/x/exp => github.com/golang/exp v0.0.0-20250813145105-42675adae3e6
	golang.org/x/mod => github.com/golang/mod v0.27.0
	golang.org/x/net => github.com/golang/net v0.43.0
	golang.org/x/sync => github.com/golang/sync v0.16.0
	golang.org/x/sys => github.com/golang/sys v0.35.0
	golang.org/x/term => github.com/golang/term v0.34.0
	golang.org/x/text => github.com/golang/text v0.28.0
	golang.org/x/time => github.com/golang/time v0.12.0
	golang.org/x/tools => github.com/golang/tools v0.36.0
)

replace gopkg.in/yaml.v3 => github.com/go-yaml/yaml v0.0.0-20220527083530-f6f7691b1fde

replace gopkg.in/yaml.v2 => github.com/go-yaml/yaml v0.0.0-20201117154620-7649d4548cb5

require (
	github.com/getkin/kin-openapi v0.132.0
	github.com/go-chi/chi/v5 v5.2.2
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.7.5
	github.com/oapi-codegen/runtime v1.1.1
	github.com/pressly/goose/v3 v3.24.3
	github.com/stretchr/testify v1.10.0
)

require (
	github.com/apapsch/go-jsonmerge/v2 v2.0.0 // indirect
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/go-openapi/jsonpointer v0.21.0 // indirect
	github.com/go-openapi/swag v0.23.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/josharian/intern v1.0.0 // indirect
	github.com/mailru/easyjson v0.7.7 // indirect
	github.com/mfridman/interpolate v0.0.2 // indirect
	github.com/mohae/deepcopy v0.0.0-20170929034955-c48cc78d4826 // indirect
	github.com/oasdiff/yaml v0.0.0-20250309154309-f31be36b4037 // indirect
	github.com/oasdiff/yaml3 v0.0.0-20250309153720-d2182401db90 // indirect
	github.com/perimeterx/marshmallow v1.1.5 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	github.com/sethvargo/go-retry v0.3.0 // indirect
	go.uber.org/multierr v1.11.0 // indirect
	golang.org/x/crypto v0.38.0 // indirect
	golang.org/x/sync v0.16.0 // indirect
	golang.org/x/text v0.28.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace gopkg.in/check.v1 => github.com/go-check/check v0.0.0-20201130134442-10cb98267c6c
