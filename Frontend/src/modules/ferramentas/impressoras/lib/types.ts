export type PrinterType = 'thermal_label' | 'laser_a4' | 'inkjet' | 'network_raw' | 'other';
export type ConnectionType = 'local_spooler' | 'network_tcp' | 'usb_direct' | 'server_shared';
export type RawProtocol = 'spooler_native' | 'zpl' | 'tspl' | 'esc_pos' | 'none';
export type PrinterStatus = 'online' | 'offline' | 'busy' | 'error';
export type PrintJobStatus = 'pending' | 'printing' | 'completed' | 'failed' | 'cancelled';

export interface HubPrinter {
  id: string;
  name: string;
  system_printer_name?: string | null;
  printer_type: PrinterType;
  connection_type: ConnectionType;
  ip_address?: string | null;
  default_width_mm: number;
  default_height_mm: number;
  default_orientation: 'landscape' | 'portrait';
  dpi: number;
  location?: string | null;
  status: PrinterStatus;
  is_default: boolean;
  raw_protocol: RawProtocol;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePrinterPayload {
  name: string;
  system_printer_name?: string;
  printer_type?: PrinterType;
  connection_type?: ConnectionType;
  ip_address?: string;
  default_width_mm?: number;
  default_height_mm?: number;
  default_orientation?: 'landscape' | 'portrait';
  dpi?: number;
  location?: string;
  is_default?: boolean;
  raw_protocol?: RawProtocol;
  notes?: string;
}

export interface UpdatePrinterPayload {
  name?: string;
  system_printer_name?: string;
  printer_type?: PrinterType;
  connection_type?: ConnectionType;
  ip_address?: string;
  default_width_mm?: number;
  default_height_mm?: number;
  default_orientation?: 'landscape' | 'portrait';
  dpi?: number;
  location?: string;
  status?: PrinterStatus;
  is_default?: boolean;
  raw_protocol?: RawProtocol;
  notes?: string;
}

export interface SystemPrinterInfo {
  name: string;
  driver_name?: string | null;
  port_name?: string | null;
  is_default: boolean;
  is_network: boolean;
  status: string;
}

export interface HubPrintJob {
  id: string;
  printer_id: string;
  printer_name: string;
  operator_id?: string | null;
  operator_name?: string | null;
  title: string;
  template_id?: string | null;
  payload_type: 'label_canvas_json' | 'pdf' | 'raw_svg' | 'image_png' | 'zpl' | 'tspl';
  payload_data: string;
  copies: number;
  status: PrintJobStatus;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface CreatePrintJobPayload {
  printer_id: string;
  title: string;
  template_id?: string;
  payload_type?: string;
  payload_data: string;
  copies?: number;
}
