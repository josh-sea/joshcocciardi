import React from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput, 
  ActivityIndicator,
  StyleSheet
} from 'react-native';

/**
 * Shared component for location search functionality
 * Contains the input field, search results, and related UI
 */
const LocationSearchForm = ({
  locationInput,
  adding,
  searchResults,
  searching,
  handleLocationInputChange,
  selectSearchResult,
  addLocationManually,
  showTitle = true,
  styles: externalStyles
}) => {
  return (
    <View style={externalStyles?.addLocationSection || styles.addLocationSection}>
      {showTitle && (
        <Text style={externalStyles?.sectionLabel || styles.sectionLabel}>
          Add New Location
        </Text>
      )}
      
      <View style={externalStyles?.inputContainer || styles.inputContainer}>
        <TextInput
          style={externalStyles?.locationInput || styles.locationInput}
          placeholder="Enter city, state or zipcode (e.g., New York, NY or 10001)"
          value={locationInput}
          onChangeText={handleLocationInputChange}
          autoCapitalize="words"
          autoCorrect={false}
        />
        <TouchableOpacity 
          style={[
            externalStyles?.addButton || styles.addButton, 
            adding && (externalStyles?.addButtonDisabled || styles.addButtonDisabled)
          ]}
          onPress={addLocationManually}
          disabled={adding}
        >
          <Text style={externalStyles?.addButtonText || styles.addButtonText}>
            {adding ? 'Adding...' : 'Add'}
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* Search Results */}
      {(searching || searchResults.length > 0) && (
        <View style={externalStyles?.searchResultsContainer || styles.searchResultsContainer}>
          {searching && (
            <View style={externalStyles?.searchingIndicator || styles.searchingIndicator}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={externalStyles?.searchingText || styles.searchingText}>
                Searching...
              </Text>
            </View>
          )}
          {searchResults.map((result) => (
            <TouchableOpacity
              key={result.id}
              style={externalStyles?.searchResultItem || styles.searchResultItem}
              onPress={() => selectSearchResult(result)}
            >
              <View style={externalStyles?.searchResultContent || styles.searchResultContent}>
                <Text style={externalStyles?.searchResultName || styles.searchResultName}>
                  {result.name}
                </Text>
                <Text style={externalStyles?.searchResultDetails || styles.searchResultDetails}>
                  {result.zipcode !== 'N/A' ? `Zipcode: ${result.zipcode}` : 'No zipcode available'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

// Default styles - can be overridden by passing external styles
const styles = StyleSheet.create({
  addLocationSection: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginRight: 10,
    color: 'black',
    backgroundColor: 'white',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonDisabled: {
    backgroundColor: '#ccc',
  },
  addButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  searchResultsContainer: {
    marginTop: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    maxHeight: 200,
    overflow: 'hidden',
  },
  searchingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchingText: {
    marginLeft: 8,
    color: '#666',
    fontSize: 14,
  },
  searchResultItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchResultContent: {
    padding: 12,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  searchResultDetails: {
    fontSize: 14,
    color: '#666',
  },
});

export default LocationSearchForm;
