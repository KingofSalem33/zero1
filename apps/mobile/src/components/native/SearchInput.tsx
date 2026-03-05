import { TextInput, type TextInputProps } from "react-native";
import { styles, T } from "../../theme/mobileStyles";

interface SearchInputProps extends Omit<TextInputProps, "style"> {
  value: string;
  onChangeText: (value: string) => void;
}

export function SearchInput({
  value,
  onChangeText,
  ...rest
}: SearchInputProps) {
  return (
    <TextInput
      {...rest}
      value={value}
      onChangeText={onChangeText}
      accessibilityLabel={
        rest.accessibilityLabel ??
        (typeof rest.placeholder === "string" ? rest.placeholder : "Search")
      }
      placeholderTextColor={T.colors.textMuted}
      style={[styles.input, styles.searchInput]}
    />
  );
}
