package dto

import (
	"fmt"
	"strings"

	"github.com/go-playground/validator/v10"
)

var validate *validator.Validate

func init() {
	validate = validator.New()
}

func Validate(s any) error {
	return validate.Struct(s)
}

func FormatValidationErrors(err error) map[string]string {
	if err == nil {
		return nil
	}

	validatoinErrors, ok := err.(validator.ValidationErrors)

	if !ok {
		return map[string]string{
			"error": err.Error(),
		}
	}

	fieldErrors := make(map[string]string)
	for _, e := range validatoinErrors {
		fieldErrors[formatFieldName(e.Field())] = formatValidationMessage(e)
	}

	return fieldErrors
}

func formatFieldName(field string) string {
	if field == "" {
		return ""
	}
	var result strings.Builder
	runes := []rune(field)

	for i, r := range runes {
		if i > 0 && r >= 'A' && r <= 'Z' {
			prevIsLower := runes[i-1] >= 'a' && runes[i-1] <= 'z'
			nextIsLower := i+1 < len(runes) && runes[i+1] >= 'a' && runes[i+1] <= 'z'

			if prevIsLower || nextIsLower {
				result.WriteRune('_')
			}
		}
		result.WriteRune(r)
	}
	return strings.ToLower(result.String())
}

func formatValidationMessage(e validator.FieldError) string {
	field := e.Field()
	tag := e.Tag()

	switch tag {
	case "required":
		return fmt.Sprintf("%s is required", field)
	case "min":
		return fmt.Sprintf("%s must be atleast %s", field, e.Param())
	case "max":
		return fmt.Sprintf("%s must be maximum %s", field, e.Param())
	case "email":
		return fmt.Sprintf("%s must be a valid email address", field)
	case "url":
		return fmt.Sprintf("%s must be a valid url", field)
	case "oneof":
		return fmt.Sprintf("%s must be one of : %s", field, e.Param())
	case "required_if":
		return fmt.Sprintf("%s is required when %s", field, e.Param())
	case "required_unless":
		return fmt.Sprintf("%s is required unless %s", field, e.Param())
	case "dive":
		return fmt.Sprintf("validation failed for items in %s", field)
	case "uuid":
		return fmt.Sprintf("%s must be valid UUID", field)
	case "gte":
		return fmt.Sprintf("%s must be greater than or equal to %s", field, e.Param())
	case "lte":
		return fmt.Sprintf("%s must be less than or equal to %s", field, e.Param())
	default:
		return fmt.Sprintf("%s failed validation: %s", field, tag)
	}
}
