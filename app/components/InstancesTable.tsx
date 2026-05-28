"use client";

import React, { useState } from "react";
import {
  Box,
  Table,
  HStack,
  VStack,
  Text,
  Badge,
  Button,
  Flex,
  Menu,
  Dialog,
  Portal,
} from "@chakra-ui/react";
import {
  CircleCheck,
  CircleX,
  TriangleAlert,
  ChevronDown,
  Terminal,
  RefreshCw,
  StopCircle,
  Trash2,
  X,
  AlertTriangle,
} from "lucide-react";
import { getAWSColors, AWS_COLORS, getStatusStyle } from "@/app/theme/aws";
import { useThemeMode } from "@/app/providers";
import type { Run } from "@/src/types";

interface InstancesTableProps {
  runs: Run[];
  selectedRunId: string | null;
  onSelectRun: (run: Run | null) => void;
  onStopRun: (runId: string) => void;
  onTerminateRun: (runId: string) => void | Promise<void>;
  onLaunchNew: () => void;
  isLoading: boolean;
  onRefresh: () => void;
}

export function InstancesTable({
  runs,
  selectedRunId,
  onSelectRun,
  onStopRun,
  onTerminateRun,
  onLaunchNew,
  isLoading,
  onRefresh,
}: InstancesTableProps) {
  const { theme } = useThemeMode();
  const colors = getAWSColors(theme);
  const isDark = theme === "dark";

  const [terminateTarget, setTerminateTarget] = useState<Run | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);

  const handleConfirmTerminate = async () => {
    if (!terminateTarget) return;
    setIsTerminating(true);
    try {
      await onTerminateRun(terminateTarget.id);
      setTerminateTarget(null);
    } finally {
      setIsTerminating(false);
    }
  };

  return (
    <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} borderRadius="md" overflow="hidden">
      {/* Table Actions Header */}
      <Flex
        px={4}
        py={2.5}
        bg={isDark ? "slate.900" : "slate.100"}
        borderBottom="1px solid"
        borderColor={colors.border}
        justify="space-between"
        align="center"
        wrap="wrap"
        gap={2}
      >
        <HStack gap={2}>
          <Text fontSize="12px" fontWeight="bold" color={colors.text}>
            Instances ({runs.length})
          </Text>
          <Button
            size="xs"
            variant="outline"
            borderColor={colors.border}
            color={colors.text}
            onClick={onRefresh}
            title="Refresh list"
            cursor="pointer"
            height="24px"
            px={2.5}
            _hover={{ bg: colors.rowHover }}
          >
            <RefreshCw size={11} className={isLoading ? "animate-spin" : ""} />
          </Button>
        </HStack>

        <HStack gap={2}>
          {/* Launch instance button */}
          <Button
            size="xs"
            bg={AWS_COLORS.orange.main}
            color="white"
            fontWeight="bold"
            height="24px"
            px={3}
            cursor="pointer"
            _hover={{ bg: AWS_COLORS.orange.hover }}
            onClick={onLaunchNew}
          >
            Launch instances
          </Button>

          {/* Instance state dropdown actions */}
          <Button
            size="xs"
            variant="outline"
            borderColor={colors.border}
            color={selectedRunId ? colors.text : colors.subtext}
            disabled={!selectedRunId}
            height="24px"
            px={3}
            cursor={selectedRunId ? "pointer" : "not-allowed"}
            _hover={selectedRunId ? { bg: colors.rowHover } : {}}
            onClick={() => {
              if (selectedRunId) {
                const run = runs.find((r) => r.id === selectedRunId);
                if (run && run.status === "running") {
                  onStopRun(run.id);
                }
              }
            }}
          >
            <StopCircle size={11} style={{ marginRight: "4px" }} />
            Stop Instance
          </Button>

          {/* Terminate Instance button */}
          <Button
            size="xs"
            variant="outline"
            borderColor={colors.border}
            color={selectedRunId ? "red.500" : colors.subtext}
            disabled={!selectedRunId}
            height="24px"
            px={3}
            cursor={selectedRunId ? "pointer" : "not-allowed"}
            _hover={selectedRunId ? { bg: "red.500/10", borderColor: "red.500/30" } : {}}
            onClick={() => {
              if (!selectedRunId) return;
              const target = runs.find((r) => r.id === selectedRunId);
              if (target) setTerminateTarget(target);
            }}
          >
            <Trash2 size={11} style={{ marginRight: "4px" }} />
            Terminate Instance
          </Button>
        </HStack>
      </Flex>

      {/* Instances Grid Table */}
      <Box overflowX="auto">
        <Table.Root size="sm" variant="outline" border="none">
          <Table.Header bg={isDark ? "white/5" : "gray.50"}>
            <Table.Row borderColor={colors.border}>
              <Table.ColumnHeader color={colors.subtext} fontSize="10px" py={2} w="40px" textAlign="center">
                Select
              </Table.ColumnHeader>
              <Table.ColumnHeader color={colors.subtext} fontSize="10px" py={2}>Instance ID</Table.ColumnHeader>
              <Table.ColumnHeader color={colors.subtext} fontSize="10px" py={2}>Name (Target URL)</Table.ColumnHeader>
              <Table.ColumnHeader color={colors.subtext} fontSize="10px" py={2}>Instance State</Table.ColumnHeader>
              <Table.ColumnHeader color={colors.subtext} fontSize="10px" py={2}>Instance Type</Table.ColumnHeader>
              <Table.ColumnHeader color={colors.subtext} fontSize="10px" py={2}>Status Checks</Table.ColumnHeader>
              <Table.ColumnHeader color={colors.subtext} fontSize="10px" py={2}>Alarm Status</Table.ColumnHeader>
              <Table.ColumnHeader color={colors.subtext} fontSize="10px" py={2}>Availability Zone</Table.ColumnHeader>
              <Table.ColumnHeader color={colors.subtext} fontSize="10px" py={2}>Launch Time</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {runs.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={9} textAlign="center" py={8} color={colors.subtext} fontSize="11px">
                  No instances found. Launch an instance to get started.
                </Table.Cell>
              </Table.Row>
            ) : (
              runs.map((run) => {
                const isSelected = selectedRunId === run.id;
                const statusStyle = getStatusStyle(run.status);
                const shortId = `i-${run.id.slice(0, 17)}`;
                
                // Status Checks details
                let checksText = "Initializing...";
                let checksColor = "yellow";
                if (run.status === "completed") {
                  checksText = "2/2 checks passed";
                  checksColor = "green";
                } else if (run.status === "failed" || run.status === "cancelled") {
                  checksText = "Checks failed";
                  checksColor = "red";
                }

                // Alarm details
                const alarmsText = run.status === "failed" ? "1 alarm" : "No alarms";

                return (
                  <Table.Row
                    key={run.id}
                    onClick={() => onSelectRun(isSelected ? null : run)}
                    bg={isSelected ? (isDark ? "rgba(236,114,17,0.12)" : "rgba(236,114,17,0.06)") : "transparent"}
                    borderBottom="1px solid"
                    borderColor={colors.border}
                    cursor="pointer"
                    _hover={{ bg: isSelected ? undefined : colors.rowHover }}
                    transition="background-color 0.15s ease"
                  >
                    <Table.Cell py={2.5} textAlign="center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // Row click handles it
                        style={{ cursor: "pointer" }}
                      />
                    </Table.Cell>
                    <Table.Cell py={2.5} fontWeight="semibold" fontSize="11px" color={AWS_COLORS.orange.main} fontFamily="mono">
                      {shortId}
                    </Table.Cell>
                    <Table.Cell py={2.5} fontSize="11px" color={colors.text} fontWeight="medium">
                      {run.config.url}
                    </Table.Cell>
                    <Table.Cell py={2.5}>
                      <Badge
                        variant="subtle"
                        borderRadius="sm"
                        fontSize="10px"
                        fontWeight="semibold"
                        display="inline-flex"
                        alignItems="center"
                        gap={1.5}
                        px={2}
                        py={0.5}
                        bg={statusStyle.bg}
                        color={isDark ? statusStyle.darkColor : statusStyle.color}
                        borderColor={statusStyle.border}
                        borderWidth="1px"
                      >
                        <Box
                          w="6px"
                          h="6px"
                          borderRadius="full"
                          bg={statusStyle.dotColor}
                          style={statusStyle.animate ? { animation: "pulse-glow 1.2s infinite" } : {}}
                        />
                        {statusStyle.label}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell py={2.5} fontSize="11px" color={colors.subtext} fontFamily="mono">
                      t3.medium
                    </Table.Cell>
                    <Table.Cell py={2.5} fontSize="11px" fontWeight="medium" color={checksColor === "green" ? "green.600" : checksColor === "red" ? "red.500" : colors.text}>
                      {checksText}
                    </Table.Cell>
                    <Table.Cell py={2.5} fontSize="11px" color={alarmsText.includes("alarm") ? "red.500" : colors.subtext} fontWeight={alarmsText.includes("alarm") ? "bold" : "normal"}>
                      {alarmsText}
                    </Table.Cell>
                    <Table.Cell py={2.5} fontSize="11px" color={colors.subtext}>
                      local-1a
                    </Table.Cell>
                    <Table.Cell py={2.5} fontSize="11px" color={colors.subtext} fontFamily="mono">
                      {new Date(run.createdAt).toLocaleString()}
                    </Table.Cell>
                  </Table.Row>
                );
              })
            )}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Internal Animation styles for status dots */}
      <style jsx global>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.7); }
        }
      `}</style>

      <TerminateInstanceDialog
        target={terminateTarget}
        isTerminating={isTerminating}
        onCancel={() => {
          if (!isTerminating) setTerminateTarget(null);
        }}
        onConfirm={handleConfirmTerminate}
        isDark={isDark}
        colors={colors}
      />
    </Box>
  );
}

interface TerminateDialogProps {
  target: Run | null;
  isTerminating: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  isDark: boolean;
  colors: ReturnType<typeof getAWSColors>;
}

function TerminateInstanceDialog({
  target,
  isTerminating,
  onCancel,
  onConfirm,
  isDark,
  colors,
}: TerminateDialogProps) {
  const isOpen = target !== null;
  const shortId = target ? `i-${target.id.slice(0, 17)}` : "";
  const statusStyle = target ? getStatusStyle(target.status) : null;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(e) => {
        if (!e.open) onCancel();
      }}
      placement="center"
      motionPreset="scale"
      closeOnInteractOutside={!isTerminating}
      closeOnEscape={!isTerminating}
    >
      <Portal>
        <Dialog.Backdrop
          bg={isDark ? "rgba(0, 0, 0, 0.72)" : "rgba(15, 23, 42, 0.55)"}
          backdropFilter="blur(2px)"
        />
        <Dialog.Positioner>
          <Dialog.Content
            bg={colors.cardBg}
            color={colors.text}
            border="1px solid"
            borderColor={colors.border}
            borderRadius="md"
            maxW="520px"
            w="92vw"
            overflow="hidden"
            boxShadow={
              isDark
                ? "0 24px 60px rgba(0, 0, 0, 0.6), 0 2px 4px rgba(0, 0, 0, 0.4)"
                : "0 24px 60px rgba(15, 23, 42, 0.25), 0 2px 4px rgba(15, 23, 42, 0.08)"
            }
            p={0}
          >
            {/* AWS-style dark squid-ink header bar */}
            <Flex
              align="center"
              gap={2.5}
              px={5}
              py={3}
              bg={AWS_COLORS.header.bg}
              borderBottom="2px solid"
              borderColor="#d13212"
            >
              <Flex
                w="22px"
                h="22px"
                bg="rgba(209, 50, 18, 0.18)"
                border="1px solid rgba(209, 50, 18, 0.6)"
                borderRadius="sm"
                align="center"
                justify="center"
              >
                <AlertTriangle size={13} color="#ff6b4a" strokeWidth={2.5} />
              </Flex>
              <Dialog.Title flex={1}>
                <Text
                  fontSize="13px"
                  fontWeight="bold"
                  color="white"
                  letterSpacing="0.1px"
                >
                  Terminate instance?
                </Text>
              </Dialog.Title>
              <Button
                variant="ghost"
                size="xs"
                px={1.5}
                minW="22px"
                h="22px"
                color="rgba(255,255,255,0.7)"
                _hover={{ bg: "rgba(255,255,255,0.1)", color: "white" }}
                onClick={onCancel}
                disabled={isTerminating}
                aria-label="Close"
              >
                <X size={13} />
              </Button>
            </Flex>

            {/* Body */}
            <Box px={5} py={4}>
              <Text fontSize="12px" color={colors.text} mb={3} lineHeight="1.55">
                Once an instance is terminated, all logs, generated specs, and
                workspace files are <Box as="span" fontWeight="bold">permanently deleted</Box>.
                This action cannot be undone.
              </Text>

              {/* Instance details — AWS Resource summary style */}
              <Box
                border="1px solid"
                borderColor={colors.border}
                borderRadius="sm"
                bg={isDark ? "rgba(255,255,255,0.02)" : "#fafbfc"}
                overflow="hidden"
              >
                <Flex
                  px={3}
                  py={1.5}
                  bg={isDark ? "rgba(255,255,255,0.04)" : "#f2f3f3"}
                  borderBottom="1px solid"
                  borderColor={colors.border}
                  align="center"
                  gap={1.5}
                >
                  <Box w="3px" h="10px" bg={AWS_COLORS.orange.main} borderRadius="full" />
                  <Text
                    fontSize="10px"
                    fontWeight="bold"
                    color={colors.subtext}
                    textTransform="uppercase"
                    letterSpacing="0.5px"
                  >
                    Instance details
                  </Text>
                </Flex>

                {target && (
                  <VStack align="stretch" gap={0} fontSize="11px">
                    <DialogRow label="Instance ID" isDark={isDark} colors={colors}>
                      <Text fontFamily="mono" color={AWS_COLORS.orange.main} fontWeight="semibold">
                        {shortId}
                      </Text>
                    </DialogRow>
                    <DialogRow label="Target URL" isDark={isDark} colors={colors}>
                      <Text color={colors.text} truncate maxW="280px" title={target.config.url}>
                        {target.config.url}
                      </Text>
                    </DialogRow>
                    <DialogRow label="State" isDark={isDark} colors={colors} isLast>
                      {statusStyle && (
                        <Badge
                          variant="subtle"
                          borderRadius="sm"
                          fontSize="10px"
                          fontWeight="semibold"
                          display="inline-flex"
                          alignItems="center"
                          gap={1.5}
                          px={2}
                          py={0.5}
                          bg={statusStyle.bg}
                          color={isDark ? statusStyle.darkColor : statusStyle.color}
                          borderColor={statusStyle.border}
                          borderWidth="1px"
                        >
                          <Box w="5px" h="5px" borderRadius="full" bg={statusStyle.dotColor} />
                          {statusStyle.label}
                        </Badge>
                      )}
                    </DialogRow>
                  </VStack>
                )}
              </Box>
            </Box>

            {/* Footer */}
            <Flex
              px={5}
              py={3}
              bg={isDark ? "rgba(0,0,0,0.25)" : "#f8fafc"}
              borderTop="1px solid"
              borderColor={colors.border}
              justify="flex-end"
              gap={2}
            >
              <Button
                size="sm"
                variant="outline"
                borderColor={colors.border}
                color={colors.text}
                bg="transparent"
                _hover={{ bg: colors.rowHover }}
                fontWeight="semibold"
                fontSize="11px"
                height="28px"
                px={3.5}
                onClick={onCancel}
                disabled={isTerminating}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                bg="#d13212"
                color="white"
                _hover={{ bg: "#b62a0e" }}
                _active={{ bg: "#9a2208" }}
                fontWeight="bold"
                fontSize="11px"
                height="28px"
                px={3.5}
                onClick={onConfirm}
                loading={isTerminating}
                loadingText="Terminating..."
              >
                <Trash2 size={11} style={{ marginRight: "6px" }} />
                Terminate
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function DialogRow({
  label,
  children,
  isDark,
  colors,
  isLast,
}: {
  label: string;
  children: React.ReactNode;
  isDark: boolean;
  colors: ReturnType<typeof getAWSColors>;
  isLast?: boolean;
}) {
  return (
    <Flex
      px={3}
      py={2}
      borderBottom={isLast ? "none" : "1px solid"}
      borderColor={colors.border}
      align="center"
      gap={3}
    >
      <Text
        flex="0 0 110px"
        color={colors.subtext}
        fontSize="10px"
        textTransform="uppercase"
        letterSpacing="0.4px"
        fontWeight="semibold"
      >
        {label}
      </Text>
      <Box flex={1} minW={0}>{children}</Box>
    </Flex>
  );
}
