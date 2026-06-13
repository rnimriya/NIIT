{{- define "neet-service.labels" -}}
app.kubernetes.io/name: {{ .Values.name }}
app.kubernetes.io/part-of: neet-ai
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "neet-service.selectorLabels" -}}
app.kubernetes.io/name: {{ .Values.name }}
{{- end -}}
